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
	type Gemini as GeminiModelSpec,
	type ModelInput,
	type ResolvedAgent,
	type RunInput,
	type SessionEvent,
	type TokenUsage,
	isModelSpec,
	isScriptedModel,
} from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { ScriptedLlm } from "./scripted-llm";

const APP_NAME = "nestjs-adk";

interface Reroute {
	from: string;
	to: string;
	reason: string;
}

interface Runtime {
	labels?: Record<string, string>;
	reroutes?: Reroute[];
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
		const llmAgent = await this.toNative(agent, { labels: input.labels, reroutes });
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
			yield* flushReroutes(reroutes);
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

			const text = (event.content?.parts ?? []).map((part) => part.text ?? "").join("");
			// Tool-call-only turns still emit llm_response (no text) so consumers can aggregate usage.
			if (text || (event.usageMetadata && getFunctionCalls(event).length > 0)) {
				yield {
					type: "llm_response",
					agent: author,
					text: text || undefined,
					usage: event.usageMetadata ? mapUsage(event.usageMetadata) : undefined,
					raw: { event },
				};
			}

			if (isFinalResponse(event) && getFunctionCalls(event).length === 0) finalText += text;
		}

		yield* flushReroutes(reroutes);
		yield { type: "final", agent: agent.name, text: finalText, usage: total };
	}

	/** Pure translation ResolvedAgent → native LlmAgent (also used by createAdkEntry/adk web). */
	public async toNative(agent: ResolvedAgent, runtime: Runtime = {}): Promise<LlmAgent> {
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
		let contextCompactors: TokenBasedContextCompactor[] | undefined;
		const compaction = agent.context?.compaction;
		if (compaction) {
			const summarizerModel = await this.resolveModel(compaction.summarizer ?? agent.model, runtime.reroutes);
			contextCompactors = [
				new TokenBasedContextCompactor({
					tokenThreshold: compaction.maxTokens,
					eventRetentionSize: compaction.keepRecent ?? 5,
					summarizer: new LlmSummarizer({
						llm: typeof summarizerModel === "string" ? LLMRegistry.newLlm(summarizerModel) : summarizerModel,
					}),
				}),
			];
		}

		return new LlmAgent({
			name: agent.name,
			description: agent.description,
			instruction: agent.instruction,
			model: await this.resolveModel(agent.model, runtime.reroutes),
			tools,
			subAgents,
			outputSchema: agent.outputSchema,
			generateContentConfig: buildGenerateContentConfig(geminiSpec),
			beforeModelCallback: runtime.labels ? mergeLabelsCallback(runtime.labels) : undefined,
			contextCompactors,
		});
	}

	private async resolveModel(model: ModelInput | undefined, reroutes?: Reroute[]): Promise<string | BaseLlm> {
		if (isScriptedModel(model)) {
			return new ScriptedLlm(model, (request) => {
				this.lastRequest = request;
			});
		}

		if (isModelSpec(model)) {
			switch (model.__adkModelSpec) {
				case "gemini":
					return new Gemini({
						model: model.model,
						apiKey: model.apiKey,
						vertexai: model.vertexai,
						project: model.project,
						location: model.location,
					});

				case "openai-like": {
					// the bridge is ESM-only — dynamic import keeps the adapter's CJS build working
					const bridge = await import("adk-llm-bridge");
					const apiKey = model.apiKeyEnv ? process.env[model.apiKeyEnv] : process.env.OPENAI_API_KEY;
					return bridge.Custom(model.model, {
						baseURL: model.baseUrl ?? "https://api.openai.com/v1",
						apiKey,
					});
				}

				case "router": {
					const keys = Object.keys(model.targets);
					const models: Record<string, BaseLlm> = {};
					for (const key of keys) {
						const resolved = await this.resolveModel(model.targets[key] as ModelInput, reroutes);
						models[key] = typeof resolved === "string" ? LLMRegistry.newLlm(resolved) : resolved;
					}

					let current = keys[0] ?? "";
					return new RoutedLlm({
						models,
						// failover: advances in declared order when the target fails before the 1st chunk
						router: (_models, _request, errorContext) => {
							if (!errorContext) {
								current = keys[0] ?? "";
								return current;
							}
							const next = keys.find((key) => !errorContext.failedKeys.has(key));
							if (next) {
								reroutes?.push({ from: current, to: next, reason: describeError(errorContext.lastError) });
								current = next;
							}
							return next;
						},
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

function* flushReroutes(reroutes: Reroute[]): Generator<AgentEvent> {
	while (reroutes.length > 0) {
		const reroute = reroutes.shift();
		if (!reroute) break;
		yield { type: "model_rerouted", from: reroute.from, to: reroute.to, reason: reroute.reason };
	}
}

function buildGenerateContentConfig(spec: GeminiModelSpec | undefined): Record<string, unknown> | undefined {
	if (!spec) return undefined;
	if (!spec.labels && !spec.cache && !spec.config) return undefined;
	return {
		...spec.config,
		...(spec.labels ? { labels: spec.labels } : {}),
		...(spec.cache ? { cachedContent: spec.cache.content } : {}),
	};
}

/** Per-run labels (ask({ labels })) — the same point where the ADK injects `adk_agent_name`. */
function mergeLabelsCallback(labels: Record<string, string>) {
	return ({ request }: { request: LlmRequest }) => {
		request.config ??= {};
		request.config.labels = { ...request.config.labels, ...labels };
		return undefined;
	};
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
