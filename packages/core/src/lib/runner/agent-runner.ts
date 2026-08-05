import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, Optional, type Type } from "@nestjs/common";
import { z } from "zod";
import { AdkEngine } from "../abstracts/adk-engine";
import type { AdkToolSource, ToolSourceContext } from "../abstracts/adk-tool-source";
import { ArtifactStore } from "../abstracts/artifact-store";
import { PricingSource } from "../abstracts/pricing-source";
import { SessionStore } from "../abstracts/session-store";
import { ADK_OPTIONS } from "../constants";
import { ContextCollector } from "../diagnostics/context-collector";
import type { ContextSnapshot } from "../diagnostics/context-types";
import {
	type AdkError,
	AgentMaxIterationsError,
	AiEmptyResponseError,
	ApprovalNotFoundError,
	DuplicateToolSourceError,
	OutputValidationError,
	SessionNotFoundError,
	ToolExecutionError,
	ToolInvalidArgsError,
	ToolRepeatedFailureError,
	ToolSourceAuthError,
	ToolSourceUnavailableError,
} from "../errors";
import { type ContextPolicy, DEFAULT_OFFLOAD_THRESHOLD } from "../models/context-policy";
import type { AdkModuleOptions } from "../module/adk-options";
import { PRICING_CURRENCY, llmCost } from "../pricing/cost-calculator";
import type { CallCost, CostBreakdown, ModelCost, ModelPrice, RunCost } from "../pricing/pricing-types";
import type { AgentDefinition, ToolBinding } from "../registry/agent-definition";
import { AgentRegistry } from "../registry/agent-registry";
import { artifactEncoding } from "../types/artifact-encoding";
import type {
	AgentEvent,
	PendingApproval,
	ReauthRequest,
	RunInput,
	RunResult,
	Session,
	SessionEvent,
	TokenUsage,
} from "../types/events";
import { isJsonSchema, pruneByProperties } from "../types/json-schema";
import type { ApprovalPolicy, ToolEffect } from "../types/options";
import type { ResolvedAgent, ResolvedTool } from "../types/resolved-agent";
import { isToolContent, toolContent } from "../types/tool-content";
import type { ToolContext } from "../types/tool-context";
import { ToolsetResolver } from "../types/toolset";
import { buildInstruction, skillContent } from "./instruction-builder";
import { RunLogger } from "./run-logger";
import { DeltaStateBag } from "./state-bag";

const EMPTY_USAGE: TokenUsage = { promptTokens: 0, outputTokens: 0, totalTokens: 0 };
/** Placeholder in RunCost.unpriced for calls whose engine did not report which model served them. */
const UNKNOWN_MODEL = "unknown";
/** State key for pending approvals (HITL). */
const HITL_STATE_KEY = "__adk_hitl";
/** Invalid tool arguments returned to the model before the run is aborted. */
const DEFAULT_MAX_INVALID_ARGS = 2;

interface RunLimits {
	maxIterations?: number;
	maxConsecutiveToolFailures?: number;
	/** Unlike the others, this one always has a value: an unbounded retry loop costs real money. */
	maxInvalidArgs: number;
}

interface RunRuntime {
	/** Artifact scope (sessionId, or ephemeral id per run). */
	scope: string;
	/** Pending approvals created during this run. */
	pendings: PendingApproval[];
	/** Consecutive failure count per tool (circuit breaker): a success resets that tool's count. */
	failures: Map<string, number>;
	/** Consecutive invalid-argument count per tool: a valid call resets that tool's count. */
	invalidArgs: Map<string, number>;
	/** The run's state bag, read when freezing the scope of a paused (HITL) action. */
	state?: DeltaStateBag;
	/** Sources to open for this run. Left undefined by callers that must not own their lifetime. */
	sources?: AdkToolSource[];
	/** Sources handed to `open()`, closed at the end, whether opening succeeded or not. */
	opened: AdkToolSource[];
	/** Sources that asked the user to authorize again. */
	reauth: ReauthRequest[];
	/** Which tool effects pause for approval this run (ask() > forRoot defaults > "destructive"). */
	approval: ApprovalPolicy;
	limits: RunLimits;
	log?: RunLogger;
	/** Aborts the engine loop and stores the fatal error for run() to rethrow. */
	abort(error: AdkError): void;
	fatal?: AdkError;
}

/**
 * Execution layer 1: the normalized event loop.
 * Resolves the agent via DI, manages the session (ephemeral or persistent), builds the instruction,
 * applies Continuity (offload/HITL) and delegates the loop to the engine.
 */
@Injectable()
export class AgentRunner {
	// `Adk:` prefix like the rest of the library, so an existing log filter keeps catching these.
	private readonly logger = new Logger("Adk:sources");

	public constructor(
		private readonly engine: AdkEngine,
		private readonly registry: AgentRegistry,
		private readonly store: SessionStore,
		private readonly artifacts: ArtifactStore,
		@Inject(ADK_OPTIONS) private readonly options: AdkModuleOptions,
		@Optional() private readonly toolsets?: ToolsetResolver,
		@Optional() private readonly pricing?: PricingSource,
		@Optional() private readonly collector?: ContextCollector,
	) {}

	public async *run(agentType: Type | string, input: RunInput): AsyncGenerator<AgentEvent> {
		const definition = this.definitionOf(agentType);
		const log = RunLogger.create(this.options.logging, definition.name);
		log?.start(input);

		const session = await this.openSession(input);
		const state = this.stateBagFor(definition, { ...(session?.state ?? {}), ...(input.state ?? {}) });
		const controller = new AbortController();
		// AbortSignal.any (Node >= 20): no listener is left behind on a consumer signal shared across runs.
		const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
		const runtime = this.createRuntime(definition, input, controller, log, state);
		// Only run() and explain() own a source's lifetime; resolve() must never open what it cannot close.
		runtime.sources = input.sources;
		const ctx = this.createToolContext(definition, input, state, signal);

		// The resolution itself is inside the try: it is what opens the sources, and one of them failing
		// after another already connected would otherwise strand a socket or a child process with nobody
		// left to close it. A throw, an abort or a consumer that breaks out of this generator all land here.
		try {
			const resolved = await this.resolveAgent(definition, ctx, runtime);
			// History captured BEFORE persisting the current message: engines hydrate the context with it.
			// The capture bucket comes from ask() when it owns the run, so it can correlate it to the RunResult.
			// Gated by the collector, never by the caller: an untrusted `capture` in the input would otherwise
			// switch capture on with diagnostics off and hand the composed prompt to whoever supplied the array.
			const engineInput: RunInput = {
				...input,
				signal,
				history: session?.events,
				capture: this.collector ? (input.capture ?? this.collector.open()) : undefined,
				streaming: input.streaming ?? this.options.streaming,
			};

			// `messageEventId` means the app already wrote this turn: writing it again would duplicate
			// the row in ITS table, not in ours.
			if (session && !input.messageEventId) await this.persist(session.id, "user", "message", { text: input.message });

			// Iteration = one batch of tool calls (consecutive tool_call events count once, parallel calls).
			let iterations = 0;
			let usage = EMPTY_USAGE;
			let lastEventType: AgentEvent["type"] | undefined;
			const cost = new RunCostMeter(this.pricing);

			try {
				for await (const event of this.engine.run(resolved, engineInput)) {
					// Defense against engines that swallow the breaker's error and ignore the abort signal.
					if (runtime.fatal) break;
					// A delta never counts: providers that report usage on streaming chunks report it
					// cumulatively, and the turn's aggregated response carries the same tokens again.
					if (event.type === "llm_response" && event.usage && !event.partial) usage = addUsage(usage, event.usage);
					if (event.type === "tool_call" && lastEventType !== "tool_call") {
						iterations += 1;
						const limit = runtime.limits.maxIterations;
						if (limit !== undefined && iterations > limit) {
							runtime.abort(new AgentMaxIterationsError(definition.name, limit, usage, event.tool));
							break;
						}
					}
					lastEventType = event.type;

					const priced = cost.price(event);
					log?.event(priced);
					if (session) await this.persistAgentEvent(session.id, priced);
					if (event.type === "final" && definition.output && definition.outputKey) {
						const parsed = definition.output.safeParse(tryParseJson(event.text));
						if (parsed.success) state.set(definition.outputKey, parsed.data);
					}
					yield priced;
				}
			} catch (error) {
				if (runtime.fatal) {
					log?.abort(runtime.fatal, usage);
					throw runtime.fatal;
				}
				throw error;
			}
			if (runtime.fatal) {
				log?.abort(runtime.fatal, usage);
				throw runtime.fatal;
			}

			for (const pending of runtime.pendings) {
				const approval: AgentEvent = {
					type: "approval_required",
					agent: pending.agent,
					callId: pending.callId,
					tool: pending.tool,
					args: pending.args,
				};
				log?.event(approval);
				yield approval;
			}

			// Emitted after the turn: the answer the model managed to give still reaches the user, with the
			// note that some integrations were left out because they need to be reconnected.
			for (const request of runtime.reauth) {
				const event: AgentEvent = { type: "reauth_required", agent: definition.name, ...request };
				log?.event(event);
				yield event;
			}

			if (session) {
				const delta = state.delta();
				if (Object.keys(delta).length > 0) await this.store.updateState(session.id, delta);
			}
		} finally {
			await this.closeSources(runtime);
		}
	}

	/** Layer 2 (sugar): aggregates the loop, final text + usage + trace (what every consumer would do by hand). */
	public async ask<TOutput = unknown>(agentType: Type | string, input: RunInput): Promise<RunResult<TOutput>> {
		// Opened here, not in run(), so the snapshots can be keyed by the RunResult this call returns.
		const capture = this.collector?.open();
		return this.collect<TOutput>(agentType, this.run(agentType, capture ? { ...input, capture } : input), capture);
	}

	/** The aggregation half of ask(), shared with approve()/reject(): same stream in, same result out. */
	private async collect<TOutput = unknown>(
		agentType: Type | string,
		stream: AsyncGenerator<AgentEvent>,
		capture: ContextSnapshot[] | undefined,
	): Promise<RunResult<TOutput>> {
		const events: AgentEvent[] = [];
		let text = "";
		let usage: TokenUsage = EMPTY_USAGE;
		let cost: RunCost | undefined;
		let agentName = typeof agentType === "string" ? agentType : agentType.name;

		try {
			for await (const event of stream) {
				events.push(event);
				if (event.type === "run_start") agentName = event.agent;
				if (event.type === "final") {
					text = event.text;
					usage = event.usage;
					cost = event.cost;
				}
			}
		} catch (error) {
			if (error instanceof Error) throw this.captured(error, capture);
			throw error;
		}

		const pending: PendingApproval[] = [];
		const reauth: ReauthRequest[] = [];
		for (const event of events) {
			if (event.type === "approval_required") {
				pending.push({ callId: event.callId, tool: event.tool, args: event.args, agent: event.agent });
			}
			if (event.type === "reauth_required") reauth.push({ source: event.source, reason: event.reason });
		}
		if (pending.length > 0) {
			return this.correlate({ text, usage, cost, events, status: "pending_approval", pending, reauth }, capture);
		}

		if (!text.trim()) throw this.captured(new AiEmptyResponseError(agentName), capture);

		const definition = this.definitionOf(agentType);
		let output: TOutput | undefined;
		if (definition.output) {
			const result = definition.output.safeParse(tryParseJson(text));
			if (!result.success) throw this.captured(new OutputValidationError(agentName, text, result.error.issues), capture);
			output = result.data as TOutput;
		}

		return this.correlate({ text, usage, cost, events, status: "completed", output, reauth }, capture);
	}

	/**
	 * Context the agent WOULD send to the provider, without spending a token: the engine builds the
	 * request through its real pipeline and stops before the call. Undefined when the engine does not
	 * support it: the ScriptedEngine, for instance, has no native request to describe.
	 */
	public async explain(agentType: Type | string, input: RunInput = { message: "" }): Promise<ContextSnapshot[]> {
		const definition = this.definitionOf(agentType);
		// Read-only: a dry run must not create the session the way an actual run does.
		const session = input.sessionId
			? await this.store.get(input.sessionId, { excludeEventId: input.messageEventId })
			: null;
		// Same state precedence as run(): session state under the call's own, or state-dependent
		// instructions would render differently here than in the run this is supposed to describe.
		const dryInput: RunInput = { ...input, state: { ...(session?.state ?? {}), ...(input.state ?? {}) } };
		const state = this.stateBagFor(definition, dryInput.state ?? {});
		const runtime = this.createRuntime(definition, dryInput);
		// Sources are opened here too: skipping them would produce a snapshot without the MCP tool
		// declarations, omitting exactly the block that weighs most on the cacheable prefix. It spends
		// no tokens, but it does spend I/O.
		runtime.sources = input.sources;

		try {
			const resolved = await this.resolveAgent(definition, this.createToolContext(definition, dryInput, state), runtime);
			const snapshots = await this.engine.explain(resolved, { ...input, history: session?.events });
			if (snapshots.length === 0) {
				new Logger(`Adk:${definition.name}`).warn(
					`explain() produced no context: ${this.engine.constructor.name} never reached a model call.`,
				);
			}
			return snapshots;
		} finally {
			await this.closeSources(runtime);
		}
	}

	/**
	 * Approves a pending action (HITL): executes the tool and resumes the agent with the result.
	 * A tool that came from a source needs `sources` again: the lib does not keep credentials and the
	 * original connection is closed, so whoever resumes reopens the source, the same way ask() does.
	 * The approved call itself runs outside the gate; the resumed turn is a new run, so a fresh call
	 * of the same tool pauses again, which is the correct reading of "approve THIS call".
	 *
	 * The first event is a `tool_result` carrying the ORIGINAL callId and the executed tool's result:
	 * that is what lets a UI replace its "awaiting approval" row instead of showing it forever, and it
	 * arrives in band, through the same event loop as any other turn. Everything after it is the
	 * resumed run, streaming as usual.
	 */
	public async *approveStream(
		agentType: Type | string,
		params: { sessionId: string; callId: string; message?: string; sources?: AdkToolSource[] },
	): AsyncGenerator<AgentEvent> {
		const resumed = await this.settleApproval(agentType, params);
		yield resumed.event;
		yield* this.run(agentType, resumed.input);
	}

	/** Aggregated flavor of approveStream(): the `tool_result` of the approved call is in `events` too. */
	public async approve(
		agentType: Type | string,
		params: { sessionId: string; callId: string; message?: string; sources?: AdkToolSource[] },
	): Promise<RunResult> {
		const resumed = await this.settleApproval(agentType, params);
		const capture = this.collector?.open();
		const stream = prepend(resumed.event, this.run(agentType, capture ? { ...resumed.input, capture } : resumed.input));
		return this.collect(agentType, stream, capture);
	}

	/** Executes the approved call, persists its result, clears the pending entry and shapes the resume. */
	private async settleApproval(
		agentType: Type | string,
		params: { sessionId: string; callId: string; message?: string; sources?: AdkToolSource[] },
	): Promise<{ event: AgentEvent; input: RunInput }> {
		const definition = this.definitionOf(agentType);
		const { session, entry, rest } = await this.takePending(params.sessionId, params.callId);

		// The frozen scope goes UNDER the session: it restores the keys the paused turn was carrying,
		// without undoing anything written while the approval was waiting. An approval answered days
		// later must not resurrect a value the session has since corrected.
		const scope = entry.state ?? {};
		const state = this.stateBagFor(definition, { ...scope, ...session.state });
		const ctx = this.createToolContext(
			definition,
			{ message: "", sessionId: session.id, userId: session.userId, state: scope },
			state,
		);

		const binding = definition.tools.find((candidate) => candidate.options.name === entry.tool);
		const result = binding
			? await this.executeBinding(definition, binding, entry.args, ctx)
			: await this.executeFromSources(definition, entry, params, ctx);

		await this.persist(session.id, "tool", "tool_result", { callId: entry.callId, tool: entry.tool, result });
		await this.store.updateState(session.id, { [HITL_STATE_KEY]: rest });

		const message =
			params.message ??
			`[system] Action "${entry.tool}" was approved by the user and executed. Result: ${JSON.stringify(result)}. Continue the conversation.`;
		return {
			event: { type: "tool_result", agent: entry.agent, callId: entry.callId, tool: entry.tool, result },
			// The scope rides along: the agent may call other tools while wrapping up this same turn.
			// The sources ride along too: the resumed turn should see the same tools the paused one saw.
			input: { sessionId: session.id, userId: session.userId, message, state: scope, sources: params.sources },
		};
	}

	/** Reopens the run's sources to execute an approved tool that no declared binding answers for. */
	private async executeFromSources(
		definition: AgentDefinition,
		entry: PendingApproval,
		params: { sessionId: string; callId: string; sources?: AdkToolSource[] },
		ctx: ToolContext,
	): Promise<unknown> {
		if (!params.sources?.length) throw new ApprovalNotFoundError(params.callId, params.sessionId);

		const runtime = this.createRuntime(definition, { message: "", sources: params.sources });
		runtime.sources = params.sources;
		try {
			const tools = await this.openSources(runtime, ctx, definition.name);
			// The raw tool from open() carries no gate: this execution IS the approved call.
			const tool = tools.find((candidate) => candidate.name === entry.tool);
			if (!tool) throw new ApprovalNotFoundError(params.callId, params.sessionId);
			try {
				return await tool.execute(entry.args);
			} catch (error) {
				throw new ToolExecutionError(entry.tool, error);
			}
		} finally {
			await this.closeSources(runtime);
		}
	}

	/** Rejects a pending action (HITL): does NOT execute it and informs the agent. */
	public async reject(
		agentType: Type | string,
		params: { sessionId: string; callId: string; reason?: string },
	): Promise<RunResult> {
		const input = await this.settleRejection(params);
		return this.ask(agentType, input);
	}

	/** Streaming flavor of reject(): the resumed turn arrives event by event, like any other run. */
	public async *rejectStream(
		agentType: Type | string,
		params: { sessionId: string; callId: string; reason?: string },
	): AsyncGenerator<AgentEvent> {
		const input = await this.settleRejection(params);
		yield* this.run(agentType, input);
	}

	/** Clears the pending entry without executing it and shapes the resume. */
	private async settleRejection(params: { sessionId: string; callId: string; reason?: string }): Promise<RunInput> {
		const { session, entry, rest } = await this.takePending(params.sessionId, params.callId);
		await this.store.updateState(session.id, { [HITL_STATE_KEY]: rest });

		const reason = params.reason ? ` (reason: ${params.reason})` : "";
		const message = `[system] The user rejected action "${entry.tool}"${reason}. The action was NOT executed. Continue the conversation.`;
		// The frozen scope rides along, exactly as it does on approval: a rejection resumes the SAME
		// turn, and an agent with declared state has no way to continue without the keys the paused
		// run was carrying. Nothing executes here, so passing it on is all this path does with it.
		return { sessionId: session.id, userId: session.userId, message, state: entry.state ?? {} };
	}

	/** Public resolution (used by createAdkEntry and engine tools): ResolvedAgent with an ephemeral ToolContext. */
	public resolve(agentType: Type | string, input: RunInput = { message: "" }): Promise<ResolvedAgent> {
		const definition = this.definitionOf(agentType);
		const state = this.stateBagFor(definition, { ...(input.state ?? {}) });
		const runtime = this.createRuntime(definition, input);
		return this.resolveAgent(definition, this.createToolContext(definition, input, state), runtime);
	}

	// ---------- internals ----------

	/** Keys the run's snapshots by the result object, so matchers can take RunResults directly. */
	private correlate<TOutput>(result: RunResult<TOutput>, capture: ContextSnapshot[] | undefined): RunResult<TOutput> {
		if (capture) this.collector?.attach(result, capture);
		return result;
	}

	/** Same correlation for the failure path: the context of a run that threw stays inspectable. */
	private captured<TError extends Error>(error: TError, capture: ContextSnapshot[] | undefined): TError {
		if (capture) this.collector?.attach(error, capture);
		return error;
	}

	private definitionOf(agentType: Type | string): AgentDefinition {
		return typeof agentType === "string" ? this.registry.get(agentType) : this.registry.getByType(agentType);
	}

	private async openSession(input: RunInput): Promise<Session | null> {
		if (!input.sessionId) return null;
		const existing = await this.store.get(input.sessionId, { excludeEventId: input.messageEventId });
		if (existing) return existing;
		return this.store.create({ id: input.sessionId, userId: input.userId });
	}

	private async takePending(sessionId: string, callId: string) {
		const session = await this.store.get(sessionId);
		if (!session) throw new SessionNotFoundError(sessionId);
		const pendings = (session.state[HITL_STATE_KEY] as PendingApproval[] | undefined) ?? [];
		const entry = pendings.find((candidate) => candidate.callId === callId);
		if (!entry) throw new ApprovalNotFoundError(callId, sessionId);
		return { session, entry, rest: pendings.filter((candidate) => candidate.callId !== callId) };
	}

	private createToolContext(
		definition: AgentDefinition,
		input: RunInput,
		state: DeltaStateBag,
		signal?: AbortSignal,
	): ToolContext {
		return {
			agentName: definition.name,
			sessionId: input.sessionId,
			userId: input.userId,
			state,
			attributes: input.attributes ?? {},
			signal: signal ?? input.signal ?? new AbortController().signal,
			actions: { endRun: () => undefined },
		};
	}

	private stateBagFor(definition: AgentDefinition, initial: Record<string, unknown>): DeltaStateBag {
		return new DeltaStateBag(initial, { schema: definition.options?.state, agent: definition.name });
	}

	private createRuntime(
		definition: AgentDefinition,
		input: RunInput,
		controller?: AbortController,
		log?: RunLogger,
		state?: DeltaStateBag,
	): RunRuntime {
		const runtime: RunRuntime = {
			scope: input.sessionId ?? randomUUID(),
			pendings: [],
			failures: new Map(),
			invalidArgs: new Map(),
			state,
			opened: [],
			reauth: [],
			approval: input.approval ?? this.options.defaults?.approval ?? "destructive",
			limits: this.limitsFor(definition, input),
			log,
			abort: (error) => {
				runtime.fatal ??= error;
				controller?.abort();
			},
		};
		return runtime;
	}

	/** Resolution: ask() override > @Agent > forRoot defaults; unset at every level = unlimited. */
	private limitsFor(definition: AgentDefinition, input: RunInput): RunLimits {
		return {
			maxIterations: input.maxIterations ?? definition.options?.maxIterations ?? this.options.defaults?.maxIterations,
			maxConsecutiveToolFailures:
				input.maxConsecutiveToolFailures ??
				definition.options?.maxConsecutiveToolFailures ??
				this.options.defaults?.maxConsecutiveToolFailures,
			maxInvalidArgs:
				input.maxInvalidArgs ??
				definition.options?.maxInvalidArgs ??
				this.options.defaults?.maxInvalidArgs ??
				DEFAULT_MAX_INVALID_ARGS,
		};
	}

	private policyOf(definition: AgentDefinition): ContextPolicy | undefined {
		return definition.options?.context ?? this.options.context;
	}

	private async resolveAgent(
		definition: AgentDefinition,
		ctx: ToolContext,
		runtime: RunRuntime,
	): Promise<ResolvedAgent> {
		const policy = this.policyOf(definition);
		const offloadEnabled = policy?.offload !== false;
		const threshold = (policy?.offload || undefined)?.threshold ?? DEFAULT_OFFLOAD_THRESHOLD;

		const tools: ResolvedTool[] = definition.tools.map((binding) => ({
			name: binding.options.name ?? "",
			description: binding.options.description,
			schema: binding.options.schema,
			effect: binding.options.effect ?? "write",
			execute: async (input: unknown) => {
				const raw = await this.executeGuarded(definition, binding, input, ctx, runtime);
				if (!offloadEnabled || binding.options.offload === false) return raw;
				return this.maybeOffload(raw, binding.options.name ?? "", threshold, runtime.scope);
			},
		}));

		const offloaded = (external: ResolvedTool[]): ResolvedTool[] =>
			external.map((tool) => ({
				...tool,
				execute: async (input: unknown) => {
					const raw = await tool.execute(input);
					return offloadEnabled ? this.maybeOffload(raw, tool.name, threshold, runtime.scope) : raw;
				},
			}));

		for (const ref of definition.toolsets) {
			tools.push(...offloaded((await this.toolsets?.resolve(ref)) ?? []));
		}

		// Same treatment as a configured toolset: an external result is exactly the kind that arrives
		// large and unannounced, and a per-run source has no more claim to bypass the context budget.
		tools.push(...offloaded(await this.openSources(runtime, ctx, definition.name)));

		// With no tools there's nothing to offload, and adding read_artifact would change the engine's
		// structured output mode (responseSchema → set_model_response). Only added when real tools exist.
		if (offloadEnabled && tools.length > 0) tools.push(this.createReadArtifactTool(runtime.scope));
		if (definition.skills.some((skill) => skill.options.mode === "on-demand")) {
			tools.push(this.createLoadSkillTool(definition));
		}

		const subAgents: ResolvedAgent[] = [];
		for (const subType of definition.subAgents) {
			const subDefinition = this.registry.getByType(subType);
			subAgents.push(await this.resolveAgent(subDefinition, { ...ctx, agentName: subDefinition.name }, runtime));
		}

		let workflow: ResolvedAgent["workflow"];
		if (definition.workflow) {
			const agents: ResolvedAgent[] = [];
			for (const agentType of definition.workflow.agents) {
				const agentDefinition = this.registry.getByType(agentType as Type);
				agents.push(await this.resolveAgent(agentDefinition, { ...ctx, agentName: agentDefinition.name }, runtime));
			}
			workflow = { mode: definition.workflow.mode, agents, maxIterations: definition.workflow.maxIterations };
		}

		return {
			name: definition.name,
			description: definition.description,
			instruction: await buildInstruction(definition, { promptsDir: this.options.prompts?.dir }, ctx),
			model: this.registry.modelFor(definition),
			tools: this.validated(this.gated(tools, definition.name, runtime, ctx), runtime, definition.name),
			subAgents,
			workflow,
			outputSchema: definition.output,
			context: policy,
		};
	}

	/**
	 * The schema stops being decoration and becomes the contract. Engines hand the model's arguments
	 * over untouched, so without this `z.infer` is a type-level fiction, `.default()` never applies,
	 * and (the part that bites) any key the model invents reaches the tool. A `workspaceId` the
	 * model made up is exactly what `ctx` exists to prevent, and Zod's strip drops it here.
	 *
	 * Wrapping outermost is deliberate: approval snapshots the arguments, so validating after it would
	 * let a forged one sit in the pending queue and execute later, when nobody is looking at it.
	 */
	private validated(tools: ResolvedTool[], runtime: RunRuntime, agent: string): ResolvedTool[] {
		return tools.map((tool) => ({
			...tool,
			execute: async (input: unknown) => {
				// A JSON Schema tool is an external server's contract: the server validates on its side,
				// so nothing rejects arguments locally and `maxInvalidArgs` does not count for it. What
				// stays local is the strip: a key the model invented must not reach a third-party system,
				// and the approval snapshot (taken inside `gated`, which this wraps) must hold clean args.
				if (isJsonSchema(tool.schema)) return tool.execute(pruneByProperties(input, tool.schema));

				const parsed = tool.schema.safeParse(input);
				if (parsed.success) {
					runtime.invalidArgs.delete(tool.name);
					return tool.execute(parsed.data);
				}

				const attempts = (runtime.invalidArgs.get(tool.name) ?? 0) + 1;
				runtime.invalidArgs.set(tool.name, attempts);
				const issues = parsed.error.issues
					.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
					.join("; ");

				// The model wrote these arguments and is the only one who can fix them, so the first
				// mistakes go back as a result rather than as an exception, which would kill the run over
				// a missing field. Past the limit the schema is unsatisfiable, not mistyped, and retrying
				// only spends tokens.
				if (attempts > runtime.limits.maxInvalidArgs) {
					const fatal = new ToolInvalidArgsError(agent, tool.name, attempts, issues);
					runtime.abort(fatal);
					throw fatal;
				}

				runtime.log?.invalidArgs(tool.name, attempts, runtime.limits.maxInvalidArgs, issues);
				return { error: `Invalid arguments for "${tool.name}": ${issues}. Fix them and call the tool again.` };
			},
		}));
	}

	/**
	 * Opens the run's tool sources. Duplicates are rejected before any connection is attempted: the
	 * name prefixes the tools, so finding out after five handshakes would be wasted I/O on a run that
	 * has to fail anyway. Opening happens in parallel: a user with five integrations should not pay
	 * five round trips in series.
	 */
	private async openSources(runtime: RunRuntime, ctx: ToolContext, agentName: string): Promise<ResolvedTool[]> {
		const sources = runtime.sources ?? [];
		if (sources.length === 0) return [];

		const seen = new Set<string>();
		for (const source of sources) {
			if (seen.has(source.name)) throw new DuplicateToolSourceError(source.name);
			seen.add(source.name);
		}

		const context: ToolSourceContext = {
			agentName,
			sessionId: ctx.sessionId,
			userId: ctx.userId,
			signal: ctx.signal,
		};

		const opened = await Promise.all(
			sources.map(async (source) => {
				// Registered before opening: a source that fails halfway may still hold a socket or a
				// child process, and close() is the only thing that will reclaim it.
				runtime.opened.push(source);
				try {
					return await source.open(context);
				} catch (error) {
					if (error instanceof ToolSourceAuthError) {
						runtime.reauth.push({ source: source.name, reason: error.reason });
						return [];
					}
					if (error instanceof ToolSourceUnavailableError) {
						// The cause carries what actually happened (ECONNREFUSED, ENOENT, a TLS failure); without
						// it the line says an integration vanished and offers nothing to act on.
						this.logger.warn(`${error.message} ${describe(error.cause)}`);
						return [];
					}
					throw error;
				}
			}),
		);

		return opened.flat();
	}

	/** One source failing to close must not strand the others, including the child processes. */
	private async closeSources(runtime: RunRuntime): Promise<void> {
		if (runtime.opened.length === 0) return;
		const results = await Promise.allSettled(runtime.opened.map((source) => source.close()));
		runtime.opened.length = 0;
		for (const result of results) {
			if (result.status === "rejected") this.logger.warn(`tool source failed to close: ${describe(result.reason)}`);
		}
	}

	/**
	 * HITL gate, applied to every tool the model can call, declared or external. It reads `effect`
	 * and nothing else, so an MCP tool pauses under the same rule as a decorated class. A tool
	 * without an effect is a source's tool that never classified itself: it gets `destructive`,
	 * because the benefit of the doubt is not ours to give.
	 */
	private gated(tools: ResolvedTool[], agent: string, runtime: RunRuntime, ctx: ToolContext): ResolvedTool[] {
		return tools.map((tool) => {
			if (!pausesFor(tool.effect ?? "destructive", runtime.approval)) return tool;
			return {
				...tool,
				execute: async (input: unknown) => {
					const pending: PendingApproval = {
						callId: randomUUID(),
						tool: tool.name,
						args: input,
						agent,
						// Frozen here because `ask({ state })` is per-call and never persisted: only the delta
						// written during the run is. Without this the approval would resume with a session
						// state that never had the scope, and a tool holding for permission is exactly the one
						// that must not run without an owner.
						state: scopeOf(runtime),
					};
					runtime.pendings.push(pending);
					const existing = ctx.state.get<PendingApproval[]>(HITL_STATE_KEY) ?? [];
					ctx.state.set(HITL_STATE_KEY, [...existing, pending]);
					return {
						pending_approval: true,
						callId: pending.callId,
						note: `Action "${pending.tool}" requires user approval and was NOT executed. Let the user know it is awaiting approval.`,
					};
				},
			};
		});
	}

	/** Circuit breaker: N consecutive failures of the same tool abort the run (a success resets). */
	private async executeGuarded(
		definition: AgentDefinition,
		binding: ToolBinding,
		input: unknown,
		ctx: ToolContext,
		runtime: RunRuntime,
	): Promise<unknown> {
		const tool = binding.options.name ?? "";
		try {
			const raw = await this.executeBinding(definition, binding, input, ctx);
			runtime.failures.delete(tool);
			return raw;
		} catch (error) {
			const count = (runtime.failures.get(tool) ?? 0) + 1;
			runtime.failures.set(tool, count);
			const limit = runtime.limits.maxConsecutiveToolFailures;
			runtime.log?.toolFailure(tool, count, limit);
			if (limit !== undefined && count >= limit) {
				const fatal = new ToolRepeatedFailureError(definition.name, tool, count, error);
				runtime.abort(fatal);
				throw fatal;
			}
			throw error;
		}
	}

	private async executeBinding(
		definition: AgentDefinition,
		binding: ToolBinding,
		input: unknown,
		ctx: ToolContext,
	): Promise<unknown> {
		try {
			if (binding.kind === "class") return await binding.instance.execute(input as Record<string, unknown>, ctx);
			const method = (definition.instance as Record<string, (i: unknown, c: ToolContext) => unknown>)[binding.method];
			return await method?.call(definition.instance, input, ctx);
		} catch (error) {
			throw new ToolExecutionError(binding.options.name ?? "unknown", error);
		}
	}

	/** Offload: large result → ArtifactStore; the context receives a digest + reference. */
	private async maybeOffload(raw: unknown, tool: string, threshold: number, scope: string): Promise<unknown> {
		if (raw === undefined || raw === null) return raw;
		// Content never goes through here: an attachment is binary by nature and would always cross the
		// threshold, so offloading it would replace the very bytes the model was asked to look at with a
		// text digest of their base64: a truncated preview of characters nobody can read.
		if (isToolContent(raw)) return raw;
		const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);
		if (serialized.length <= threshold) return raw;

		const name = `tool-results/${tool}-${randomUUID()}`;
		const version = await this.artifacts.save(
			{ sessionId: scope, name },
			{ mimeType: "application/json", data: serialized },
		);
		return {
			__artifact: {
				name,
				version,
				bytes: serialized.length,
				preview: serialized.slice(0, 300),
				note: "Result externalized due to size. Use read_artifact(name) to read the full content.",
			},
		};
	}

	/** Built-in offload tool: the LLM drills into the artifact on demand (progressive disclosure). */
	private createReadArtifactTool(scope: string): ResolvedTool {
		return {
			name: "read_artifact",
			description: "Reads the full content of an externalized result (__artifact reference).",
			effect: "read",
			schema: z.object({
				name: z.string().describe("Artifact name (the __artifact.name field)."),
				version: z.number().optional(),
			}),
			execute: async (input: unknown) => {
				const { name, version } = input as { name: string; version?: number };
				// The model picks this name, and an ArtifactStore backed by the filesystem will join it to a
				// path. `../` would then read outside the session's scope, so it never gets that far: the
				// in-memory default is safe, but the contract is public and someone else's store is not.
				if (isUnsafeArtifactName(name)) return { error: `Artifact name "${name}" is not allowed.` };
				const part = await this.artifacts.load({ sessionId: scope, name }, version);
				if (!part) return { error: `Artifact "${name}" not found.` };
				// Text goes back as a plain result: that is what offload writes, and the model reads it
				// there just fine. Binary takes the content channel instead, so an image reaches the model
				// as something to look at rather than as a wall of base64 it can only count characters of.
				if (artifactEncoding(part) === "utf8") return { name, content: part.data };
				return toolContent([{ data: { mimeType: part.mimeType, base64: part.data } }]);
			},
		};
	}

	/** Built-in skill progressive-disclosure tool. Errors go back to the LLM, not as an exception. */
	private createLoadSkillTool(definition: AgentDefinition): ResolvedTool {
		return {
			name: "load_skill",
			description: "Loads the full content of a catalog skill by name.",
			effect: "read",
			schema: z.object({ name: z.string().describe("Skill name in the catalog.") }),
			execute: async (input: unknown) => {
				const name = (input as { name?: string }).name ?? "";
				const binding = definition.skills.find((skill) => skill.options.name === name);
				if (!binding) {
					const available = definition.skills.map((skill) => skill.options.name).join(", ");
					return { error: `Skill "${name}" does not exist. Available: ${available}` };
				}
				return { name, content: await skillContent(definition, binding) };
			},
		};
	}

	private async persistAgentEvent(sessionId: string, event: AgentEvent): Promise<void> {
		switch (event.type) {
			case "tool_call":
				return this.persist(sessionId, "agent", "tool_call", {
					callId: event.callId,
					tool: event.tool,
					args: event.args,
				});
			case "tool_result":
				return this.persist(sessionId, "tool", "tool_result", {
					callId: event.callId,
					tool: event.tool,
					result: event.result,
				});
			case "final":
				return this.persist(sessionId, "agent", "message", { text: event.text });
			default:
				return;
		}
	}

	private async persist(
		sessionId: string,
		author: SessionEvent["author"],
		type: string,
		data: Record<string, unknown>,
	): Promise<void> {
		await this.store.appendEvent(sessionId, { v: 1, id: randomUUID(), at: Date.now(), author, type, data });
	}
}

/** The head event, then everything the stream yields; how approve() puts the tool result in band. */
async function* prepend(head: AgentEvent, rest: AsyncGenerator<AgentEvent>): AsyncGenerator<AgentEvent> {
	yield head;
	yield* rest;
}

/** The scale is ordered (read < write < destructive) so a policy is a comparison, not a set. */
const EFFECT_ORDER: Record<ToolEffect, number> = { read: 0, write: 1, destructive: 2 };

function pausesFor(effect: ToolEffect, policy: ApprovalPolicy): boolean {
	if (policy === "none") return false;
	return EFFECT_ORDER[effect] >= EFFECT_ORDER[policy];
}

/**
 * The scope a paused action is frozen with. The pending queue is stripped out: it lives in the same
 * bag, and copying it into each entry would nest every pending inside the next one and grow the
 * session on every approval.
 */
function scopeOf(runtime: RunRuntime): Record<string, unknown> | undefined {
	const snapshot = runtime.state?.snapshot();
	if (!snapshot) return undefined;
	const { [HITL_STATE_KEY]: _pendings, ...scope } = snapshot;
	return Object.keys(scope).length > 0 ? scope : undefined;
}

/** Path traversal, absolute paths and control characters: none of them name a real artifact. */
function isUnsafeArtifactName(name: string): boolean {
	if (typeof name !== "string" || name.length === 0 || name.length > 512) return true;
	if (name.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(name)) return true;
	if (name.includes("..") || name.includes("\0")) return true;
	// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly the point
	return /[ -]/.test(name);
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function addBreakdown(total: CostBreakdown | undefined, delta: CostBreakdown): CostBreakdown {
	return {
		input: (total?.input ?? 0) + delta.input,
		output: (total?.output ?? 0) + delta.output,
		cached: (total?.cached ?? 0) + delta.cached,
	};
}

function addUsage(total: TokenUsage, delta: TokenUsage): TokenUsage {
	const cached = (total.cachedTokens ?? 0) + (delta.cachedTokens ?? 0);
	// A reported 0 must survive: "cache did not engage" and "provider never said" are different facts.
	const reported = total.cachedTokens != null || delta.cachedTokens != null;
	return {
		promptTokens: total.promptTokens + delta.promptTokens,
		outputTokens: total.outputTokens + delta.outputTokens,
		totalTokens: total.totalTokens + delta.totalTokens,
		...(reported ? { cachedTokens: cached } : {}),
	};
}

/**
 * Run-scoped cost aggregation. Every LLM call is priced by the model it was actually billed under,
 * so a router failover or a compaction summary lands on its own line instead of the agent's model.
 * A model without a usable price never becomes a zero: it goes to `unpriced` and the total says so.
 */
class RunCostMeter {
	private readonly byModel = new Map<string, ModelCost>();
	private readonly unpriced = new Set<string>();

	public constructor(private readonly pricing?: PricingSource) {}

	/** Returns the event with its cost attached, when there is one to attach. */
	public price(event: AgentEvent): AgentEvent {
		if (!this.pricing) return event;
		// Deltas are skipped for the same reason usage skips them: pricing a cumulative counter once per
		// chunk would bill the same tokens as many times as the provider chose to split the answer.
		if (event.type === "llm_response" && !event.partial) {
			const cost = this.add(event.model, event.usage);
			return cost ? { ...event, cost } : event;
		}
		if (event.type === "final") {
			const cost = this.result();
			return cost ? { ...event, cost } : event;
		}
		return event;
	}

	private add(model: string | undefined, usage: TokenUsage | undefined): CallCost | undefined {
		if (!usage) return undefined;
		// an engine that cannot report the model still burned tokens: the total must admit it
		if (!model) {
			this.unpriced.add(UNKNOWN_MODEL);
			return undefined;
		}

		const cost = llmCost(this.priceOf(model), usage);
		if (cost === undefined) {
			this.unpriced.add(model);
			return undefined;
		}

		const current = this.byModel.get(model);
		this.byModel.set(model, {
			model,
			calls: (current?.calls ?? 0) + 1,
			usage: addUsage(current?.usage ?? EMPTY_USAGE, usage),
			amount: (current?.amount ?? 0) + cost.amount,
			breakdown: addBreakdown(current?.breakdown, cost.breakdown),
		});
		return { amount: cost.amount, currency: PRICING_CURRENCY, breakdown: cost.breakdown, rates: cost.rates };
	}

	/** A third-party source that throws must not take the run down with it: the call just goes unpriced. */
	private priceOf(model: string): ModelPrice | undefined {
		try {
			return this.pricing?.priceFor(model);
		} catch {
			return undefined;
		}
	}

	private result(): RunCost | undefined {
		if (this.byModel.size === 0 && this.unpriced.size === 0) return undefined;
		const byModel = [...this.byModel.values()];
		return {
			total: byModel.reduce((sum, entry) => sum + entry.amount, 0),
			currency: PRICING_CURRENCY,
			byModel,
			unpriced: [...this.unpriced],
			catalogAsOf: this.pricing?.asOf(),
		};
	}
}

/** Direct JSON or the first {...} block (models sometimes wrap it with text/fences). */
function tryParseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		const match = text.match(/\{[\s\S]*\}/);
		if (!match) return text;
		try {
			return JSON.parse(match[0]);
		} catch {
			return text;
		}
	}
}
