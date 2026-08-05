import { randomUUID } from "node:crypto";
import {
	type BaseLlm,
	type Event,
	FunctionTool,
	Gemini,
	InMemorySessionService,
	LLMRegistry,
	LlmAgent,
	type LlmRequest,
	LlmSummarizer,
	RoutedLlm,
	Runner,
	type SingleBeforeModelCallback,
	TokenBasedContextCompactor,
	createEvent,
	getFunctionCalls,
	getFunctionResponses,
	isFinalResponse,
} from "@google/adk";
import {
	AdkEngine,
	type AgentEvent,
	type AnyZodObject,
	type ContextSnapshot,
	type Gemini as GeminiModelSpec,
	type ModelInput,
	type ResolvedAgent,
	type RunInput,
	type SessionEvent,
	type TokenUsage,
	isAdkModel,
	isModelSpec,
	isScriptedModel,
	modelIdOf,
} from "@nestjs-adk/core";
import { Injectable, Logger } from "@nestjs/common";
import { AdkModelLlm } from "./adk-model-llm";
import { ConfiguredLlm } from "./configured-llm";
import { toSnapshot } from "./context-capture";
import { type MeteredCall, MeteredLlm } from "./metered-llm";
import { ScriptedLlm } from "./scripted-llm";

const APP_NAME = "nestjs-adk";

interface Reroute {
	from: string;
	to: string;
	reason: string;
	/** Agent whose router moved — only its calls change model. */
	agent: string;
	/** Model id behind the target key — what the next calls are billed under. */
	toModel?: string;
}

interface Runtime {
	labels?: Record<string, string>;
	reroutes?: Reroute[];
	/** Collects calls that bypass the Runner (compaction summarizer) so they still reach usage and cost. */
	metered?: MeteredCall[];
	/** agent name → model id currently serving it, kept in sync by the reroutes. */
	models?: Map<string, string | undefined>;
	/** Context diagnostics bucket, owned by the run — engines only push into it. */
	capture?: ContextSnapshot[];
	/** Dry-run: capture the request and short-circuit before the provider is called. */
	dryRun?: boolean;
}

/**
 * Engine adapter: translates the ResolvedAgent into NATIVE @google/adk objects
 * (real LlmAgent/FunctionTool) and normalizes the loop into AgentEvents.
 * The core's SessionStore is the system of record — the ADK session is
 * rebuilt per run from the history (no double writes).
 */
@Injectable()
export class GoogleAdkEngine extends AdkEngine {
	/** Last LlmRequest seen (via ScriptedLlm) — inspection in tests/debug. */
	public lastRequest?: LlmRequest;
	/** Last resolved agent (instruction, tools...) — inspection in tests (AdkTestContext.lastInstruction). */
	public lastAgent?: ResolvedAgent;

	public async *run(agent: ResolvedAgent, input: RunInput): AsyncGenerator<AgentEvent> {
		this.lastAgent = agent;
		const reroutes: Reroute[] = [];
		const metered: MeteredCall[] = [];
		// per agent, because a sub-agent runs on its own model and must be billed under it
		const models = new Map<string, string | undefined>();
		const llmAgent = await this.toNative(agent, {
			labels: input.labels,
			reroutes,
			metered,
			models,
			capture: input.capture,
		});
		const sessionService = new InMemorySessionService();
		const userId = input.userId ?? "anonymous";
		const sessionId = input.sessionId ?? randomUUID();

		const session = await sessionService.createSession({ appName: APP_NAME, userId, sessionId });
		for (const historyEvent of input.history ?? []) {
			const adkEvent = this.toAdkEvent(agent.name, historyEvent);
			if (adkEvent) await sessionService.appendEvent({ session, event: adkEvent });
		}

		const runner = new Runner({ appName: APP_NAME, agent: llmAgent, sessionService });

		yield { type: "run_start", agent: agent.name, sessionId: input.sessionId };

		const total: TokenUsage = { promptTokens: 0, outputTokens: 0, totalTokens: 0 };
		let finalText = "";

		const events = runner.runAsync({
			userId,
			sessionId,
			newMessage: { role: "user", parts: [{ text: input.message }] },
			stateDelta: input.state,
			abortSignal: input.signal,
		});

		for await (const event of events) {
			yield* flushReroutes(reroutes, (reroute) => models.set(reroute.agent, reroute.toModel));
			yield* flushMetered(metered, agent.name, total);
			// CompactedEvent is internal to the pipeline (compaction summary) — not an agent response.
			if ((event as { isCompacted?: boolean }).isCompacted) continue;
			const author = event.author ?? agent.name;

			if (event.usageMetadata) {
				total.promptTokens += event.usageMetadata.promptTokenCount ?? 0;
				total.outputTokens += event.usageMetadata.candidatesTokenCount ?? 0;
				total.totalTokens += event.usageMetadata.totalTokenCount ?? 0;
				const cached = (event.usageMetadata as { cachedContentTokenCount?: number }).cachedContentTokenCount;
				if (cached != null) total.cachedTokens = (total.cachedTokens ?? 0) + cached;
			}

			for (const call of getFunctionCalls(event)) {
				yield {
					type: "tool_call",
					agent: author,
					callId: call.id ?? "",
					tool: call.name ?? "",
					args: call.args,
					raw: { event },
				};
			}

			for (const response of getFunctionResponses(event)) {
				yield {
					type: "tool_result",
					agent: author,
					callId: response.id ?? "",
					tool: response.name ?? "",
					result: response.response,
					raw: { event },
				};
			}

			// the ADK signals the handoff on the transfer tool's response; everything after it is the target's
			const transferTo = event.actions?.transferToAgent;
			// the target name is an LLM-generated tool argument — it reaches logs, so it cannot forge lines
			if (transferTo) yield { type: "agent_transfer", from: author, to: sanitizeName(transferTo), raw: { event } };

			const text = (event.content?.parts ?? []).map((part) => part.text ?? "").join("");
			// Any metered turn emits llm_response, with or without text: a tool-call-only turn, a safety
			// block or a MAX_TOKENS cut all burned tokens, and tokens outside the event stream cannot be priced.
			if (text || event.usageMetadata) {
				yield {
					type: "llm_response",
					agent: author,
					model: models.get(author),
					text: text || undefined,
					usage: event.usageMetadata ? mapUsage(event.usageMetadata) : undefined,
					raw: { event },
				};
			}

			if (isFinalResponse(event) && getFunctionCalls(event).length === 0) finalText += text;
		}

		yield* flushReroutes(reroutes, (reroute) => models.set(reroute.agent, reroute.toModel));
		yield* flushMetered(metered, agent.name, total);
		yield { type: "final", agent: agent.name, text: finalText, usage: total };
	}

	/**
	 * Dry-run: builds the request through the REAL native pipeline (processors, instruction, tool
	 * declarations, hydrated history) and short-circuits before the provider. Costs nothing, and
	 * shows exactly what would be sent — which the ResolvedAgent alone cannot describe.
	 */
	public async explain(agent: ResolvedAgent, input: RunInput): Promise<ContextSnapshot[]> {
		const capture: ContextSnapshot[] = [];
		const llmAgent = await this.toNative(agent, { capture, dryRun: true, labels: input.labels });
		const sessionService = new InMemorySessionService();
		const userId = input.userId ?? "anonymous";
		const sessionId = input.sessionId ?? randomUUID();

		const session = await sessionService.createSession({ appName: APP_NAME, userId, sessionId });
		for (const historyEvent of input.history ?? []) {
			const adkEvent = this.toAdkEvent(agent.name, historyEvent);
			if (adkEvent) await sessionService.appendEvent({ session, event: adkEvent });
		}

		const runner = new Runner({ appName: APP_NAME, agent: llmAgent, sessionService });
		const events = runner.runAsync({
			userId,
			sessionId,
			newMessage: { role: "user", parts: [{ text: input.message }] },
			stateDelta: input.state,
			abortSignal: input.signal,
		});
		for await (const _event of events) {
			// drains the (short-circuited) loop; the snapshots land in `capture`
		}

		return capture;
	}

	/** Pure translation ResolvedAgent → native LlmAgent (also used by createAdkEntry/adk web). */
	public async toNative(agent: ResolvedAgent, runtime: Runtime = {}): Promise<LlmAgent> {
		runtime.models?.set(agent.name, modelIdOf(agent.model));
		const tools = agent.tools.map(
			(tool) =>
				new FunctionTool({
					name: tool.name,
					description: tool.description,
					parameters: tool.schema as AnyZodObject,
					execute: (args: Record<string, unknown>) => tool.execute(args),
				}),
		);

		const subAgents: LlmAgent[] = [];
		for (const subAgent of agent.subAgents) subAgents.push(await this.toNative(subAgent, runtime));

		const geminiSpec = isModelSpec(agent.model) && agent.model.__adkModelSpec === "gemini" ? agent.model : undefined;

		// Compaction: the ADK's NATIVE contextCompactors, with an LLM summarizer.
		// Skipped on a dry run: the compactor is a request PROCESSOR, so it runs before the callback
		// that short-circuits the model — leaving it on would bill a real summarizer call for a
		// diagnostic that promises to cost nothing.
		let contextCompactors: TokenBasedContextCompactor[] | undefined;
		const compaction = runtime.dryRun ? undefined : agent.context?.compaction;
		if (compaction) {
			const summarizerModel = await this.resolveModel(compaction.summarizer ?? agent.model, runtime.reroutes, agent.name);
			const summarizerLlm = typeof summarizerModel === "string" ? LLMRegistry.newLlm(summarizerModel) : summarizerModel;
			contextCompactors = [
				new TokenBasedContextCompactor({
					tokenThreshold: compaction.maxTokens,
					eventRetentionSize: compaction.keepRecent ?? 5,
					summarizer: new LlmSummarizer({
						// summarizing a full context window is a real call the Runner never reports
						llm: runtime.metered ? new MeteredLlm(summarizerLlm, runtime.metered, mapUsage) : summarizerLlm,
					}),
				}),
			];
		}

		return new LlmAgent({
			name: agent.name,
			description: agent.description,
			instruction: agent.instruction,
			model: await this.resolveModel(agent.model, runtime.reroutes, agent.name),
			tools,
			subAgents,
			outputSchema: agent.outputSchema,
			generateContentConfig: buildGenerateContentConfig(geminiSpec),
			beforeModelCallback: buildBeforeModelCallbacks(agent.name, runtime),
			contextCompactors,
		});
	}

	private async resolveModel(
		model: ModelInput | undefined,
		reroutes?: Reroute[],
		agentName = "",
	): Promise<string | BaseLlm> {
		if (isScriptedModel(model)) {
			return new ScriptedLlm(model, (request) => {
				this.lastRequest = request;
			});
		}

		if (isAdkModel(model)) return new AdkModelLlm(model);

		if (isModelSpec(model)) {
			switch (model.__adkModelSpec) {
				case "gemini": {
					const native = new Gemini({
						model: model.model,
						apiKey: model.apiKey,
						vertexai: model.vertexai,
						project: model.project,
						location: model.location,
					});
					// Config at the model boundary too — survives router targets and the compaction summarizer.
					const specConfig = buildGenerateContentConfig(model);
					return specConfig ? new ConfiguredLlm(native, specConfig) : native;
				}

				case "openai-like": {
					// the bridge is ESM-only — dynamic import keeps the adapter's CJS build working
					const bridge = await import("adk-llm-bridge");
					const apiKey = model.apiKeyEnv ? process.env[model.apiKeyEnv] : process.env.OPENAI_API_KEY;
					return bridge.Custom(model.model, {
						baseURL: model.baseUrl ?? "https://api.openai.com/v1",
						apiKey,
					});
				}

			}
		}

		if (typeof model === "string") return model;
		throw new Error(`GoogleAdkEngine: unsupported model spec: ${JSON.stringify(model)}`);
	}

	/** SessionEvent (ours, normalized) → the ADK's native Event, to hydrate the context. */
	private toAdkEvent(agentName: string, event: SessionEvent): Event | null {
		switch (event.type) {
			case "message": {
				const author = event.author === "user" ? "user" : agentName;
				const role = event.author === "user" ? "user" : "model";
				return createEvent({
					author,
					content: { role, parts: [{ text: String(event.data.text ?? "") }] },
					timestamp: event.at,
				});
			}
			case "tool_call":
				return createEvent({
					author: agentName,
					content: {
						role: "model",
						parts: [
							{
								functionCall: {
									id: String(event.data.callId ?? ""),
									name: String(event.data.tool ?? ""),
									args: (event.data.args ?? {}) as Record<string, unknown>,
								},
							},
						],
					},
					timestamp: event.at,
				});
			case "tool_result":
				return createEvent({
					author: agentName,
					content: {
						role: "user",
						parts: [
							{
								functionResponse: {
									id: String(event.data.callId ?? ""),
									name: String(event.data.tool ?? ""),
									response: (event.data.result ?? {}) as Record<string, unknown>,
								},
							},
						],
					},
					timestamp: event.at,
				});
			default:
				return null;
		}
	}
}

const MAX_AGENT_NAME = 120;

/** Control characters out, length capped: agent names come from the model and end up in log lines. */
function sanitizeName(name: string): string {
	let clean = "";
	for (const char of name) {
		const code = char.codePointAt(0) ?? 0;
		if (code >= 0x20 && code !== 0x7f) clean += char;
	}
	return clean.slice(0, MAX_AGENT_NAME);
}

function* flushReroutes(reroutes: Reroute[], onReroute: (reroute: Reroute) => void): Generator<AgentEvent> {
	while (reroutes.length > 0) {
		const reroute = reroutes.shift();
		if (!reroute) break;
		onReroute(reroute);
		yield { type: "model_rerouted", from: reroute.from, to: reroute.to, reason: reroute.reason };
	}
}

/** Calls made outside the Runner surface here, as regular llm_responses, and join the run total. */
function* flushMetered(metered: MeteredCall[], agent: string, total: TokenUsage): Generator<AgentEvent> {
	while (metered.length > 0) {
		const call = metered.shift();
		if (!call) break;
		total.promptTokens += call.usage.promptTokens;
		total.outputTokens += call.usage.outputTokens;
		total.totalTokens += call.usage.totalTokens;
		if (call.usage.cachedTokens != null) total.cachedTokens = (total.cachedTokens ?? 0) + call.usage.cachedTokens;
		yield { type: "llm_response", agent, model: call.model, usage: call.usage };
	}
}

const GENERATION_KEYS = [
	"temperature",
	"topP",
	"topK",
	"maxOutputTokens",
	"frequencyPenalty",
	"presencePenalty",
	"stopSequences",
] as const;

/** Effective spec config: typed generation fields win over the raw `config` escape hatch. */
function buildGenerateContentConfig(spec: GeminiModelSpec | undefined): Record<string, unknown> | undefined {
	if (!spec) return undefined;
	const typed: Record<string, unknown> = {};
	for (const key of GENERATION_KEYS) {
		if (spec[key] !== undefined) typed[key] = spec[key];
	}
	const merged = {
		...spec.config,
		...typed,
		...(spec.labels ? { labels: spec.labels } : {}),
		...(spec.cache ? { cachedContent: spec.cache.content } : {}),
	};
	return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Per-run labels (ask({ labels })) — the same point where the ADK injects `adk_agent_name`. */
function mergeLabelsCallback(labels: Record<string, string>) {
	return ({ request }: { request: LlmRequest }) => {
		request.config ??= {};
		request.config.labels = { ...request.config.labels, ...labels };
		return undefined;
	};
}

/**
 * The single point where the final LlmRequest is visible for ANY model (Gemini, openai-like,
 * router, AdkModel) — the ScriptedLlm only sees the scripted path. Callbacks run in order and
 * stop at the first non-undefined return, so capture must come before the dry-run short-circuit.
 */
function buildBeforeModelCallbacks(agent: string, runtime: Runtime): SingleBeforeModelCallback[] | undefined {
	const callbacks: SingleBeforeModelCallback[] = [];

	if (runtime.labels) callbacks.push(mergeLabelsCallback(runtime.labels));

	const capture = runtime.capture;
	if (capture) {
		callbacks.push(({ request }) => {
			// Never let diagnostics break the run: an exception here would surface as a provider failure
			// and, behind a ModelRouter, reroute the model citing a serialization error as the reason.
			try {
				capture.push(toSnapshot(request, agent));
			} catch (error) {
				new Logger("Adk:diagnostics").warn(`context capture failed for "${agent}": ${describeError(error)}`);
			}
			return undefined;
		});
	}

	// Empty response: the ADK treats it as the turn's answer and never reaches the provider.
	if (runtime.dryRun) callbacks.push(() => ({ content: { role: "model", parts: [{ text: "" }] } }));

	return callbacks.length > 0 ? callbacks : undefined;
}

function describeError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function mapUsage(usage: {
	promptTokenCount?: number;
	candidatesTokenCount?: number;
	totalTokenCount?: number;
	cachedContentTokenCount?: number;
}): TokenUsage {
	return {
		promptTokens: usage.promptTokenCount ?? 0,
		outputTokens: usage.candidatesTokenCount ?? 0,
		totalTokens: usage.totalTokenCount ?? 0,
		...(usage.cachedContentTokenCount != null ? { cachedTokens: usage.cachedContentTokenCount } : {}),
	};
}
