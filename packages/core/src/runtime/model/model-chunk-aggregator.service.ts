import { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import type { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import { MalformedToolCallError } from "../../domain/model/errors/malformed-tool-call.error";
import { ToolCall } from "../../domain/model/messages/tool-call.value-object";
import { ModelResponse } from "../../domain/model/model-response.value-object";
import type { ModelChunk } from "../../domain/model/streaming/model-chunk.value-object";
import { ModelUsage } from "../../domain/model/usage/model-usage.value-object";
import { PartialToolCall } from "./partial-tool-call.value-object";

/**
 * Turns the increments of one turn into the turn.
 *
 * This is the only place aggregation happens, which is what keeps `ask` and `stream`
 * honest with each other: both read the same chunks, and the text of one is the
 * concatenation of the other by construction rather than by agreement.
 *
 * One instance serves one call. It holds the partial state of that call and nothing
 * else, so two calls never see each other's fragments.
 */
export class ModelChunkAggregator {
	private readonly text: string[] = [];
	private readonly calls = new Map<number, PartialToolCall>();
	private usage = ModelUsage.none();
	private finishReason?: string;

	public accept(chunk: ModelChunk): void {
		if (chunk.hasText) this.text.push(chunk.textDelta);
		if (chunk.usage !== undefined) this.usage = chunk.usage;
		if (chunk.finishReason !== undefined) this.finishReason = chunk.finishReason;

		const delta = chunk.toolCall;
		if (delta === undefined) return;
		const partial = this.calls.get(delta.index) ?? new PartialToolCall();
		this.calls.set(delta.index, partial.with(delta));
	}

	public toResponse(model: ModelIdentity, structuredOutput?: unknown): ModelResponse {
		return new ModelResponse(
			model,
			this.text.join(""),
			this.toolCalls(),
			this.usage,
			this.finishReason,
			structuredOutput,
		);
	}

	/** The text as it stands, for anything that needs the answer before the turn ends. */
	public get aggregatedText(): string {
		return this.text.join("");
	}

	private toolCalls(): readonly ToolCall[] {
		const calls: ToolCall[] = [];
		for (const index of [...this.calls.keys()].sort((left, right) => left - right)) {
			const partial = this.calls.get(index);
			if (partial === undefined) continue;
			calls.push(this.buildToolCall(partial, index));
		}
		return calls;
	}

	private buildToolCall(partial: PartialToolCall, index: number): ToolCall {
		const name = partial.toolName;
		if (name === undefined) throw new MalformedToolCallError(`call at index ${index}`, "the model never named the tool");
		const args = partial.parseArguments();
		if (args === undefined) throw new MalformedToolCallError(name, partial.argumentsText);
		return new ToolCall(ToolCallId.from(partial.callId ?? `call-${index}`), name, args, partial.signature);
	}
}
