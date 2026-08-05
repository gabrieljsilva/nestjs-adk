import { describe, expect, it } from "vitest";
import { ContextSegment } from "./context-segment";

describe("ContextSegment", () => {
	it("carries the text a comparison runs on", () => {
		const segment = new ContextSegment(ContextSegment.INSTRUCTIONS, "Be brief.");

		expect(segment.kind).toBe("instructions");
		expect(segment.characters).toBe(9);
	});

	it("names the three sections in the order they reach a provider", () => {
		expect([ContextSegment.INSTRUCTIONS, ContextSegment.TOOLS, ContextSegment.CONVERSATION]).toEqual([
			"instructions",
			"tools",
			"conversation",
		]);
	});
});
