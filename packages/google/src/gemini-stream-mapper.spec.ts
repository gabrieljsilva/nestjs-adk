import { describe, expect, it } from "vitest";
import { type GeminiResponseChunk, GeminiStreamMapper } from "./gemini-stream-mapper";

const mapper = new GeminiStreamMapper();

function chunkOf(chunk: GeminiResponseChunk): GeminiResponseChunk {
	return chunk;
}

describe("GeminiStreamMapper", () => {
	it("turns a text part into a text chunk", () => {
		const chunks = mapper.toChunks(chunkOf({ candidates: [{ content: { parts: [{ text: "Reem" }] } }] }));

		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.textDelta).toBe("Reem");
	});

	it("ignores an empty text part", () => {
		expect(mapper.toChunks(chunkOf({ candidates: [{ content: { parts: [{ text: "" }] } }] }))).toHaveLength(0);
	});

	it("turns a function call into one delta carrying the whole call", () => {
		const chunks = mapper.toChunks(
			chunkOf({
				candidates: [{ content: { parts: [{ functionCall: { id: "call-1", name: "refund", args: { orderId: "42" } } }] } }],
			}),
		);

		expect(chunks[0]?.toolCall?.callId).toBe("call-1");
		expect(chunks[0]?.toolCall?.toolName).toBe("refund");
		expect(chunks[0]?.toolCall?.argumentsDelta).toBe('{"orderId":"42"}');
		expect(chunks[0]?.toolCall?.opensCall).toBe(true);
	});

	it("serialises absent arguments as an empty object", () => {
		const chunks = mapper.toChunks(
			chunkOf({ candidates: [{ content: { parts: [{ functionCall: { name: "ping" } }] } }] }),
		);

		expect(chunks[0]?.toolCall?.argumentsDelta).toBe("{}");
	});

	it("indexes parallel calls in the order they arrived", () => {
		const chunks = mapper.toChunks(
			chunkOf({
				candidates: [
					{
						content: {
							parts: [{ functionCall: { name: "one" } }, { functionCall: { name: "two" } }],
						},
					},
				],
			}),
		);

		expect(chunks.map((chunk) => chunk.toolCall?.index)).toEqual([0, 1]);
	});

	it("turns usage metadata into a usage chunk, keeping the cached share apart", () => {
		const chunks = mapper.toChunks(
			chunkOf({
				usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, cachedContentTokenCount: 80 },
			}),
		);

		expect(chunks[0]?.usage?.inputTokens).toBe(100);
		expect(chunks[0]?.usage?.outputTokens).toBe(40);
		expect(chunks[0]?.usage?.cachedInputTokens).toBe(80);
	});

	it("turns a finish reason into the final chunk, after the content", () => {
		const chunks = mapper.toChunks(
			chunkOf({ candidates: [{ content: { parts: [{ text: "done" }] }, finishReason: "STOP" }] }),
		);

		expect(chunks.map((chunk) => chunk.isFinal)).toEqual([false, true]);
		expect(chunks[1]?.finishReason).toBe("STOP");
	});

	it("emits nothing for an empty chunk", () => {
		expect(mapper.toChunks(chunkOf({}))).toHaveLength(0);
		expect(mapper.toChunks(chunkOf({ candidates: [] }))).toHaveLength(0);
	});
});
