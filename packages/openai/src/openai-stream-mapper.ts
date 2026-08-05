import { ModelChunk, ModelUsage, ToolCallDelta } from "@nestjs-adk/core";

/** The fields this adapter reads from a Chat Completions stream chunk. */
export interface OpenAiStreamChunk {
	choices?: Array<{
		delta?: {
			content?: string | null;
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
 */
export class OpenAiStreamMapper {
	public toChunks(raw: OpenAiStreamChunk): ModelChunk[] {
		const chunks: ModelChunk[] = [];
		const choice = raw.choices?.[0];

		const text = choice?.delta?.content;
		if (typeof text === "string" && text.length > 0) chunks.push(ModelChunk.text(text));

		for (const call of choice?.delta?.tool_calls ?? []) {
			chunks.push(
				ModelChunk.toolCall(
					new ToolCallDelta(call.index ?? 0, call.function?.arguments ?? "", call.id, call.function?.name),
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
