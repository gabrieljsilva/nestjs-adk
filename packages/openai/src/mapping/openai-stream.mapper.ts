import { ModelChunk, ModelUsage, ToolCallDelta } from "@nestjs-adk/core";
import { OpenAiReasoningTrace } from "../model/openai-reasoning-trace.value-object";

/** The fields this adapter reads from a Chat Completions stream chunk. */
export interface OpenAiStreamChunk {
	choices?: Array<{
		delta?: {
			content?: string | null;
			/** What a thinking model reasoned before answering; DeepSeek's field, absent elsewhere. */
			reasoning_content?: string | null;
			tool_calls?: Array<{
				index?: number;
				id?: string;
				function?: { name?: string; arguments?: string };
			}>;
		};
		finish_reason?: string | null;
	}>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		prompt_tokens_details?: { cached_tokens?: number };
	} | null;
}

/**
 * Turns one raw stream chunk into the increments the runtime understands.
 *
 * A single chunk can carry several increments at once, so it answers with a list: text
 * and a tool call fragment often arrive together, and usage rides the last chunk. The
 * finish reason comes last, because it closes the turn.
 *
 * Reasoning is not text: it never reaches the answer, and a caller printing the stream
 * would otherwise print the model's notes to itself. It goes to the trace the caller holds
 * for the stream, and the first tool call that opens takes it as its signature.
 */
export class OpenAiStreamMapper {
	public toChunks(raw: OpenAiStreamChunk, trace: OpenAiReasoningTrace = new OpenAiReasoningTrace()): ModelChunk[] {
		const chunks: ModelChunk[] = [];
		const choice = raw.choices?.[0];

		const reasoning = choice?.delta?.reasoning_content;
		if (typeof reasoning === "string") trace.record(reasoning);

		const text = choice?.delta?.content;
		if (typeof text === "string" && text.length > 0) chunks.push(ModelChunk.text(text));

		for (const call of choice?.delta?.tool_calls ?? []) {
			const opens = call.id !== undefined || call.function?.name !== undefined;
			chunks.push(
				ModelChunk.toolCall(
					new ToolCallDelta(
						call.index ?? 0,
						call.function?.arguments ?? "",
						call.id,
						call.function?.name,
						opens ? trace.claim() : undefined,
					),
				),
			);
		}

		const usage = raw.usage;
		if (usage !== null && usage !== undefined) {
			chunks.push(
				ModelChunk.usage(
					ModelUsage.of(
						usage.prompt_tokens ?? 0,
						usage.completion_tokens ?? 0,
						usage.prompt_tokens_details?.cached_tokens ?? 0,
					),
				),
			);
		}

		const finish = choice?.finish_reason;
		if (typeof finish === "string" && finish.length > 0) chunks.push(ModelChunk.finish(finish));

		return chunks;
	}
}
