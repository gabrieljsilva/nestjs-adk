import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, Optional, type Type } from "@nestjs/common";
import { z } from "zod";
import { AdkEngine } from "../abstracts/adk-engine";
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
	OutputValidationError,
	SessionNotFoundError,
	ToolExecutionError,
	ToolRepeatedFailureError,
} from "../errors";
import { type ContextPolicy, DEFAULT_OFFLOAD_THRESHOLD } from "../models/context-policy";
import type { AdkModuleOptions } from "../module/adk-options";
import { PRICING_CURRENCY, llmCost } from "../pricing/cost-calculator";
import type { CallCost, ModelCost, ModelPrice, RunCost } from "../pricing/pricing-types";
import type { AgentDefinition, ToolBinding } from "../registry/agent-definition";
import { AgentRegistry } from "../registry/agent-registry";
import type {
	AgentEvent,
	PendingApproval,
	RunInput,
	RunResult,
	Session,
	SessionEvent,
	TokenUsage,
} from "../types/events";
import type { ResolvedAgent, ResolvedTool } from "../types/resolved-agent";
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

interface RunLimits {
	maxIterations?: number;
	maxConsecutiveToolFailures?: number;
}

interface RunRuntime {
	/** Artifact scope (sessionId, or ephemeral id per run). */
	scope: string;
	/** Pending approvals created during this run. */
	pendings: PendingApproval[];
	/** Consecutive failure count per tool (circuit breaker) — a success resets that tool's count. */
	failures: Map<string, number>;
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
		const runtime = this.createRuntime(definition, input, controller, log);
		const ctx = this.createToolContext(definition, input, state, signal);
		const resolved = await this.resolveAgent(definition, ctx, runtime);

		// History captured BEFORE persisting the current message — engines hydrate the context with it.
		// The capture bucket comes from ask() when it owns the run, so it can correlate it to the RunResult.
		// Gated by the collector, never by the caller: an untrusted `capture` in the input would otherwise
		// switch capture on with diagnostics off and hand the composed prompt to whoever supplied the array.
		const engineInput: RunInput = {
			...input,
			signal,
			history: session?.events,
			capture: this.collector ? (input.capture ?? this.collector.open()) : undefined,
		};

		if (session) await this.persist(session.id, "user", "message", { text: input.message });

		// Iteration = one batch of tool calls (consecutive tool_call events count once — parallel calls).
		let iterations = 0;
		let usage = EMPTY_USAGE;
		let lastEventType: AgentEvent["type"] | undefined;
		const cost = new RunCostMeter(this.pricing);

		try {
			for await (const event of this.engine.run(resolved, engineInput)) {
				// Defense against engines that swallow the breaker's error and ignore the abort signal.
				if (runtime.fatal) break;
				if (event.type === "llm_response" && event.usage) usage = addUsage(usage, event.usage);
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

		if (session) {
			const delta = state.delta();
			if (Object.keys(delta).length > 0) await this.store.updateState(session.id, delta);
		}
	}

	/** Layer 2 (sugar): aggregates the loop — final text + usage + trace (what every consumer would do by hand). */
	public async ask<TOutput = unknown>(agentType: Type | string, input: RunInput): Promise<RunResult<TOutput>> {
		const events: AgentEvent[] = [];
		let text = "";
		let usage: TokenUsage = EMPTY_USAGE;
		let cost: RunCost | undefined;
		let agentName = typeof agentType === "string" ? agentType : agentType.name;
		// Opened here, not in run(), so the snapshots can be keyed by the RunResult this call returns.
		const capture = this.collector?.open();

		try {
			for await (const event of this.run(agentType, capture ? { ...input, capture } : input)) {
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
		for (const event of events) {
			if (event.type === "approval_required") {
				pending.push({ callId: event.callId, tool: event.tool, args: event.args, agent: event.agent });
			}
		}
		if (pending.length > 0) {
			return this.correlate({ text, usage, cost, events, status: "pending_approval", pending }, capture);
		}

		if (!text.trim()) throw this.captured(new AiEmptyResponseError(agentName), capture);

		const definition = this.definitionOf(agentType);
		let output: TOutput | undefined;
		if (definition.output) {
			const result = definition.output.safeParse(tryParseJson(text));
			if (!result.success) throw this.captured(new OutputValidationError(agentName, text, result.error.issues), capture);
			output = result.data as TOutput;
		}

		return this.correlate({ text, usage, cost, events, status: "completed", output }, capture);
	}

	/**
	 * Context the agent WOULD send to the provider, without spending a token: the engine builds the
	 * request through its real pipeline and stops before the call. Undefined when the engine does not
	 * support it — the ScriptedEngine, for instance, has no native request to describe.
	 */
	public async explain(agentType: Type | string, input: RunInput = { message: "" }): Promise<ContextSnapshot[]> {
		const definition = this.definitionOf(agentType);
		// Read-only: a dry run must not create the session the way an actual run does.
		const session = input.sessionId ? await this.store.get(input.sessionId) : null;
		// Same state precedence as run(): session state under the call's own, or state-dependent
		// instructions would render differently here than in the run this is supposed to describe.
		const resolved = await this.resolve(agentType, {
			...input,
			state: { ...(session?.state ?? {}), ...(input.state ?? {}) },
		});

		const snapshots = await this.engine.explain(resolved, { ...input, history: session?.events });
		if (snapshots.length === 0) {
			new Logger(`Adk:${definition.name}`).warn(
				`explain() produced no context — ${this.engine.constructor.name} never reached a model call.`,
			);
		}
		return snapshots;
	}

	/** Approves a pending action (HITL): executes the tool and resumes the agent with the result. */
	public async approve(
		agentType: Type | string,
		params: { sessionId: string; callId: string; message?: string },
	): Promise<RunResult> {
		const definition = this.definitionOf(agentType);
		const { session, entry, rest } = await this.takePending(params.sessionId, params.callId);

		const binding = definition.tools.find((candidate) => candidate.options.name === entry.tool);
		if (!binding) throw new ApprovalNotFoundError(params.callId, params.sessionId);

		const state = this.stateBagFor(definition, session.state);
		const ctx = this.createToolContext(definition, { message: "", sessionId: session.id, userId: session.userId }, state);
		const result = await this.executeBinding(definition, binding, entry.args, ctx);

		await this.persist(session.id, "tool", "tool_result", { callId: entry.callId, tool: entry.tool, result });
		await this.store.updateState(session.id, { [HITL_STATE_KEY]: rest });

		const message =
			params.message ??
			`[system] Action "${entry.tool}" was approved by the user and executed. Result: ${JSON.stringify(result)}. Continue the conversation.`;
		return this.ask(agentType, { sessionId: session.id, userId: session.userId, message });
	}

	/** Rejects a pending action (HITL): does NOT execute it and informs the agent. */
	public async reject(
		agentType: Type | string,
		params: { sessionId: string; callId: string; reason?: string },
	): Promise<RunResult> {
		const { session, entry, rest } = await this.takePending(params.sessionId, params.callId);
		await this.store.updateState(session.id, { [HITL_STATE_KEY]: rest });

		const reason = params.reason ? ` (reason: ${params.reason})` : "";
		const message = `[system] The user rejected action "${entry.tool}"${reason}. The action was NOT executed. Continue the conversation.`;
		return this.ask(agentType, { sessionId: session.id, userId: session.userId, message });
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
		const existing = await this.store.get(input.sessionId);
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
	): RunRuntime {
		const runtime: RunRuntime = {
			scope: input.sessionId ?? randomUUID(),
			pendings: [],
			failures: new Map(),
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
			execute: async (input: unknown) => {
				if (await this.needsApproval(definition, binding, input, ctx)) {
					const pending: PendingApproval = {
						callId: randomUUID(),
						tool: binding.options.name ?? "",
						args: input,
						agent: definition.name,
					};
					runtime.pendings.push(pending);
					const existing = ctx.state.get<PendingApproval[]>(HITL_STATE_KEY) ?? [];
					ctx.state.set(HITL_STATE_KEY, [...existing, pending]);
					return {
						pending_approval: true,
						callId: pending.callId,
						note: `Action "${pending.tool}" requires user approval and was NOT executed. Let the user know it is awaiting approval.`,
					};
				}

				const raw = await this.executeGuarded(definition, binding, input, ctx, runtime);
				if (!offloadEnabled || binding.options.offload === false) return raw;
				return this.maybeOffload(raw, binding.options.name ?? "", threshold, runtime.scope);
			},
		}));

		for (const ref of definition.toolsets) {
			const external = (await this.toolsets?.resolve(ref)) ?? [];
			for (const tool of external) {
				tools.push({
					...tool,
					execute: async (input: unknown) => {
						const raw = await tool.execute(input);
						return offloadEnabled ? this.maybeOffload(raw, tool.name, threshold, runtime.scope) : raw;
					},
				});
			}
		}

		// With no tools there's nothing to offload — and adding read_artifact would change the engine's
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
			tools,
			subAgents,
			workflow,
			outputSchema: definition.output,
			context: policy,
		};
	}

	private async needsApproval(
		definition: AgentDefinition,
		binding: ToolBinding,
		input: unknown,
		ctx: ToolContext,
	): Promise<boolean> {
		const requirement = binding.options.requiresApproval;
		if (!requirement) return false;
		if (requirement === true) return true;
		const self = binding.kind === "class" ? binding.instance : definition.instance;
		return requirement.call(self, input, ctx);
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
			schema: z.object({
				name: z.string().describe("Artifact name (the __artifact.name field)."),
				version: z.number().optional(),
			}),
			execute: async (input: unknown) => {
				const { name, version } = input as { name: string; version?: number };
				const part = await this.artifacts.load({ sessionId: scope, name }, version);
				if (!part) return { error: `Artifact "${name}" not found.` };
				return { name, content: part.data };
			},
		};
	}

	/** Built-in skill progressive-disclosure tool. Errors go back to the LLM, not as an exception. */
	private createLoadSkillTool(definition: AgentDefinition): ResolvedTool {
		return {
			name: "load_skill",
			description: "Loads the full content of a catalog skill by name.",
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
		if (event.type === "llm_response") {
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
		// an engine that cannot report the model still burned tokens — the total must admit it
		if (!model) {
			this.unpriced.add(UNKNOWN_MODEL);
			return undefined;
		}

		const amount = llmCost(this.priceOf(model), usage);
		if (amount === undefined) {
			this.unpriced.add(model);
			return undefined;
		}

		const current = this.byModel.get(model);
		this.byModel.set(model, {
			model,
			calls: (current?.calls ?? 0) + 1,
			usage: addUsage(current?.usage ?? EMPTY_USAGE, usage),
			amount: (current?.amount ?? 0) + amount,
		});
		return { amount, currency: PRICING_CURRENCY };
	}

	/** A third-party source that throws must not take the run down with it — the call just goes unpriced. */
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
