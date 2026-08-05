import { describe, expect, it } from "vitest";
import { ModelChunk } from "./model-chunk";
import { ModelUsage } from "./model-usage";
import { ToolCallDelta } from "./tool-call-delta";

describe("ModelChunk", () => {
	it("carries a text delta and nothing else", () => {
		const chunk = ModelChunk.text("hel");

		expect(chunk.textDelta).toBe("hel");
		expect(chunk.hasText).toBe(true);
		expect(chunk.isFinal).toBe(false);
		expect(chunk.toolCall).toBeUndefined();
		expect(chunk.usage).toBeUndefined();
	});

	it("carries part of a tool call", () => {
		const chunk = ModelChunk.toolCall(new ToolCallDelta(0, "", "call-1", "refund"));

		expect(chunk.toolCall?.toolName).toBe("refund");
		expect(chunk.hasText).toBe(false);
	});

	it("carries the usage the provider reported", () => {
		const chunk = ModelChunk.usage(ModelUsage.of(100, 40));

		expect(chunk.usage?.totalTokens).toBe(140);
		expect(chunk.isFinal).toBe(false);
	});

	it("carries the reason the turn ended", () => {
		const chunk = ModelChunk.finish("stop");

		expect(chunk.isFinal).toBe(true);
		expect(chunk.finishReason).toBe("stop");
		expect(chunk.hasText).toBe(false);
	});

	it("reports no text for an empty delta, so a caller never prints nothing twice", () => {
		expect(ModelChunk.text("").hasText).toBe(false);
	});
});
