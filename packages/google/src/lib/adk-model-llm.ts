import { BaseLlm, type BaseLlmConnection, type LlmRequest, type LlmResponse } from "@google/adk";
import {
	type AdkModel,
	GENERATION_KEYS,
	type ModelGenerationConfig,
	type ModelMessage,
	type ModelPart,
	type ModelRequest,
	type ModelUsage,
	type ToolDeclaration,
} from "@nestjs-adk/core";
import { Logger } from "@nestjs/common";

/** Request fields already surfaced elsewhere in ModelRequest — everything else goes to config.raw. */
const NON_RAW_KEYS = new Set<string>([...GENERATION_KEYS, "systemInstruction", "tools"]);

/**
 * Adapter: runs a user AdkModel inside the ADK's native loop. Translates
 * LlmRequest → neutral ModelRequest, then assembles the chunks back into
 * LlmResponses (text deltas append, toolCalls accumulate, usage last-wins).
 */
export class AdkModelLlm extends BaseLlm {
	private readonly logger: Logger;
	private callCounter = 0;
	private readonly warnedInputDrops = new Set<string>();
	private warnedPartialUsage = false;
	private readonly emittedCallIds = new Set<string>();

	public constructor(private readonly custom: AdkModel) {
		super({ model: custom.model });
		this.logger = new Logger(`Adk:${custom.model}`);
	}

	public async *generateContentAsync(
		llmRequest: LlmRequest,
		stream?: boolean,
		abortSignal?: AbortSignal,
	): AsyncGenerator<LlmResponse, void> {
		const inputDrops = new Set<string>();
		const request = toModelRequest(this.model, llmRequest, (what) => inputDrops.add(what));
		const newDrops = [...inputDrops].filter((item) => !this.warnedInputDrops.has(item));
		if (newDrops.length > 0) {
			for (const item of newDrops) this.warnedInputDrops.add(item);
			this.logger.warn(`request items not translatable to a custom model were dropped: ${newDrops.join(", ")}`);
		}

		const textDeltas: string[] = [];
		const toolCalls: Array<{ id?: string; name: string; args: Record<string, unknown> }> = [];
		let usage: ModelUsage | undefined;
		let finishReason: string | undefined;
		let warnedResponseDrop = false;

		for await (const chunk of this.custom.generate(request, { stream: Boolean(stream), signal: abortSignal })) {
			// models are asked to honor the signal, but the engine stops consuming regardless
			if (abortSignal?.aborted) break;
			for (const part of chunk.parts ?? []) {
				if ("text" in part) {
					if (!part.text) continue;
					textDeltas.push(part.text);
					if (stream) yield { content: { role: "model", parts: [{ text: part.text }] }, partial: true };
				} else if ("toolCall" in part) {
					toolCalls.push(part.toolCall);
				} else if (!warnedResponseDrop) {
					warnedResponseDrop = true;
					this.logger.warn(`discarding unsupported response part from custom model: ${Object.keys(part).join(", ")}`);
				}
			}
			if (chunk.usage) usage = chunk.usage;
			// normalized to the ADK enum casing ("stop" → "STOP") so downstream comparisons hold
			if (chunk.finishReason) finishReason = chunk.finishReason.toUpperCase();
		}

		if (abortSignal?.aborted) return;

		const parts: NonNullable<NonNullable<LlmResponse["content"]>["parts"]> = [];
		if (textDeltas.length > 0) parts.push({ text: textDeltas.join("") });
		for (const call of toolCalls) {
			let id = call.id ?? `adk_model_call_${++this.callCounter}`;
			// a duplicated id would make the HITL approval handle ambiguous — only real duplicates are rewritten
			while (this.emittedCallIds.has(id)) {
				this.logger.warn(`custom model emitted a duplicated tool call id "${id}" — rewriting to keep it unique`);
				id = `${id}_dup${++this.callCounter}`;
			}
			this.emittedCallIds.add(id);
			parts.push({ functionCall: { id, name: call.name, args: call.args } });
		}
		if (parts.length === 0) this.logger.warn("custom model produced no output — emitting an empty response");

		// partial usage is dropped on purpose: turning an unreported counter into 0 would price the
		// call as if that side were free — a confident wrong number, worse than no number
		const reportedUsage = usage?.promptTokens != null && usage.outputTokens != null ? usage : undefined;
		if (usage && !reportedUsage && !this.warnedPartialUsage) {
			this.warnedPartialUsage = true;
			this.logger.warn("custom model reported partial token usage — the call is left uncounted and unpriced");
		}

		yield {
			content: { role: "model", parts: parts.length > 0 ? parts : [{ text: "" }] },
			...(reportedUsage ? { usageMetadata: toUsageMetadata(reportedUsage) } : {}),
			...(finishReason ? { finishReason: finishReason as LlmResponse["finishReason"] } : {}),
		};
	}

	public connect(): Promise<BaseLlmConnection> {
		throw new Error("AdkModel does not support live connections — custom models cover generate/stream only.");
	}
}

function toModelRequest(model: string, llmRequest: LlmRequest, onDrop: (what: string) => void): ModelRequest {
	const config = (llmRequest.config ?? {}) as Record<string, unknown>;
	return {
		model,
		systemInstruction: normalizeInstruction(config.systemInstruction),
		messages: toMessages(llmRequest.contents ?? [], onDrop),
		tools: toToolDeclarations(config.tools, onDrop),
		config: toGenerationConfig(config),
	};
}

/** genai ContentUnion: string | Content | Part[] — flatten to plain text. */
function normalizeInstruction(instruction: unknown): string | undefined {
	if (instruction == null) return undefined;
	if (typeof instruction === "string") return instruction;
	const parts = Array.isArray(instruction)
		? instruction
		: ((instruction as { parts?: unknown[] }).parts ?? [instruction]);
	const text = parts
		.map((part) => (typeof part === "string" ? part : ((part as { text?: string }).text ?? "")))
		.filter(Boolean)
		.join("\n");
	return text || undefined;
}

function toMessages(
	contents: Array<{ role?: string; parts?: unknown[] }>,
	onDrop: (what: string) => void,
): ModelMessage[] {
	const messages: ModelMessage[] = [];
	for (const content of contents) {
		const parts: ModelPart[] = [];
		for (const raw of content.parts ?? []) {
			const part = raw as {
				text?: string;
				thought?: boolean;
				inlineData?: { mimeType?: string; data?: string };
				functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
				functionResponse?: { id?: string; name?: string; response?: unknown };
			};
			// genai reasoning parts (thought: true) are model-internal — never input for the next call
			if (part.thought) continue;
			if (part.text !== undefined) parts.push({ text: part.text });
			else if (!part.functionCall && !part.functionResponse && !part.inlineData) {
				onDrop(`message part "${Object.keys(part as object).join(",")}"`);
			} else if (part.functionCall) {
				parts.push({
					toolCall: {
						id: part.functionCall.id,
						name: part.functionCall.name ?? "",
						args: part.functionCall.args ?? {},
					},
				});
			} else if (part.functionResponse) {
				parts.push({
					toolResult: {
						id: part.functionResponse.id,
						name: part.functionResponse.name ?? "",
						result: part.functionResponse.response,
					},
				});
			} else if (part.inlineData) {
				parts.push({ data: { mimeType: part.inlineData.mimeType ?? "", base64: part.inlineData.data ?? "" } });
			}
		}
		if (parts.length > 0) messages.push({ role: content.role === "model" ? "assistant" : "user", parts });
	}
	return messages;
}

/** genai ToolListUnion → flat function declarations (parametersJsonSchema wins over parameters). */
function toToolDeclarations(tools: unknown, onDrop: (what: string) => void): ToolDeclaration[] | undefined {
	if (!Array.isArray(tools)) return undefined;
	const declarations: ToolDeclaration[] = [];
	for (const tool of tools) {
		const functionDeclarations = (tool as { functionDeclarations?: unknown[] }).functionDeclarations;
		if (!functionDeclarations || functionDeclarations.length === 0) {
			// e.g. Gemini built-ins (googleSearch, codeExecution) — there is nothing a custom model can run.
			onDrop(`tool "${Object.keys(tool as object).join(",")}"`);
			continue;
		}
		for (const raw of functionDeclarations) {
			const declaration = raw as {
				name?: string;
				description?: string;
				parameters?: Record<string, unknown>;
				parametersJsonSchema?: Record<string, unknown>;
			};
			if (!declaration.name) {
				onDrop("unnamed function declaration");
				continue;
			}
			declarations.push({
				name: declaration.name,
				description: declaration.description,
				parameters: declaration.parametersJsonSchema ?? declaration.parameters,
			});
		}
	}
	return declarations.length > 0 ? declarations : undefined;
}

function toGenerationConfig(config: Record<string, unknown>): ModelGenerationConfig | undefined {
	const generation: ModelGenerationConfig = {};
	for (const key of GENERATION_KEYS) {
		if (config[key] !== undefined) (generation as Record<string, unknown>)[key] = config[key];
	}
	const raw: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(config)) {
		if (!NON_RAW_KEYS.has(key) && value !== undefined) raw[key] = value;
	}
	if (Object.keys(raw).length > 0) generation.raw = raw;
	return Object.keys(generation).length > 0 ? generation : undefined;
}

function toUsageMetadata(usage: ModelUsage): NonNullable<LlmResponse["usageMetadata"]> {
	return {
		promptTokenCount: usage.promptTokens,
		candidatesTokenCount: usage.outputTokens,
		totalTokenCount: usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.outputTokens ?? 0),
		...(usage.cachedTokens != null ? { cachedContentTokenCount: usage.cachedTokens } : {}),
	};
}
