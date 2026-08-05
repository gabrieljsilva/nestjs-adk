import { describe, expect, it } from "vitest";
import { type OpenAiStreamChunk, OpenAiStreamMapper } from "./openai-stream-mapper";

const mapper = new OpenAiStreamMapper();

function chunkOf(chunk: OpenAiStreamChunk): OpenAiStreamChunk {
	return chunk;
}

describe("OpenAiStreamMapper", () => {
	it("turns a content delta into a text chunk", () => {
		const chunks = mapper.toChunks(chunkOf({ choices: [{ delta: { content: "Reem" } }] }));

		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.textDelta).toBe("Reem");
	});

	it("ignores an empty content delta, so nothing prints twice", () => {
		expect(mapper.toChunks(chunkOf({ choices: [{ delta: { content: "" } }] }))).toHaveLength(0);
		expect(mapper.toChunks(chunkOf({ choices: [{ delta: { content: null } }] }))).toHaveLength(0);
	});

	it("turns the opening of a tool call into a delta carrying id and name", () => {
		const chunks = mapper.toChunks(
			chunkOf({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call-1", function: { name: "refund" } }] } }] }),
		);

		expect(chunks[0]?.toolCall?.callId).toBe("call-1");
		expect(chunks[0]?.toolCall?.toolName).toBe("refund");
		expect(chunks[0]?.toolCall?.opensCall).toBe(true);
	});

	it("turns an argument fragment into a delta that continues the call", () => {
		const chunks = mapper.toChunks(
			chunkOf({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"orderId"' } }] } }] }),
		);

		expect(chunks[0]?.toolCall?.argumentsDelta).toBe('{"orderId"');
		expect(chunks[0]?.toolCall?.opensCall).toBe(false);
	});

	it("keeps the index of parallel calls", () => {
		const chunks = mapper.toChunks(
			chunkOf({
				choices: [
					{
						delta: {
							tool_calls: [
								{ index: 0, function: { arguments: "a" } },
								{ index: 1, function: { arguments: "b" } },
							],
						},
					},
				],
			}),
		);

		expect(chunks.map((chunk) => chunk.toolCall?.index)).toEqual([0, 1]);
	});

	it("turns usage into a usage chunk, keeping the cached share apart", () => {
		const chunks = mapper.toChunks(
			chunkOf({
				usage: { prompt_tokens: 100, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 80 } },
			}),
		);

		expect(chunks[0]?.usage?.inputTokens).toBe(100);
		expect(chunks[0]?.usage?.outputTokens).toBe(40);
		expect(chunks[0]?.usage?.cachedInputTokens).toBe(80);
	});

	it("turns a finish reason into the final chunk", () => {
		const chunks = mapper.toChunks(chunkOf({ choices: [{ delta: {}, finish_reason: "stop" }] }));

		expect(chunks[0]?.isFinal).toBe(true);
		expect(chunks[0]?.finishReason).toBe("stop");
	});

	it("emits text before the finish reason when one chunk carries both", () => {
		const chunks = mapper.toChunks(chunkOf({ choices: [{ delta: { content: "done" }, finish_reason: "stop" }] }));

		expect(chunks.map((chunk) => chunk.isFinal)).toEqual([false, true]);
	});

	it("emits nothing for a keepalive chunk", () => {
		expect(mapper.toChunks(chunkOf({}))).toHaveLength(0);
		expect(mapper.toChunks(chunkOf({ choices: [] }))).toHaveLength(0);
	});
});
