import { ModelChunk, ModelUsage, ToolCallDelta } from "@nestjs-adk/core";

/** The fields this adapter reads from a generate response, streamed or whole. */
export interface GeminiResponseChunk {
	candidates?: Array<{
		content?: {
			parts?: Array<{
				text?: string;
				functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
				/** Gemini 3 hands this back with a call and refuses the next turn without it. */
				thoughtSignature?: string;
			}>;
		};
		finishReason?: string;
	}>;
	usageMetadata?: {
		promptTokenCount?: number;
		candidatesTokenCount?: number;
		cachedContentTokenCount?: number;
	};
}

/**
 * Turns one response chunk into the increments the runtime understands.
 *
 * Gemini streams a function call whole rather than as fragments of JSON, so a call
 * becomes a single delta carrying its arguments already serialised. The executor
 * assembles both shapes the same way, which is what keeps it free of provider quirks.
 *
 * From Gemini 3 on, a function call arrives next to a `thoughtSignature`, and sending the
 * conversation back without it is a 400. It is opaque and this adapter treats it as such:
 * read here, carried by the runtime, written back untouched.
 */
export class GeminiStreamMapper {
	public toChunks(raw: GeminiResponseChunk): ModelChunk[] {
		const chunks: ModelChunk[] = [];
		const candidate = raw.candidates?.[0];
		let callIndex = 0;

		for (const part of candidate?.content?.parts ?? []) {
			if (typeof part.text === "string" && part.text.length > 0) chunks.push(ModelChunk.text(part.text));
			const call = part.functionCall;
			if (call === undefined) continue;
			chunks.push(
				ModelChunk.toolCall(
					new ToolCallDelta(callIndex, JSON.stringify(call.args ?? {}), call.id, call.name, part.thoughtSignature),
				),
			);
			callIndex += 1;
		}

		const usage = raw.usageMetadata;
		if (usage !== undefined) {
			chunks.push(
				ModelChunk.usage(
					ModelUsage.of(usage.promptTokenCount ?? 0, usage.candidatesTokenCount ?? 0, usage.cachedContentTokenCount ?? 0),
				),
			);
		}

		const finish = candidate?.finishReason;
		if (typeof finish === "string" && finish.length > 0) chunks.push(ModelChunk.finish(finish));

		return chunks;
	}
}
