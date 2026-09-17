import { describe, expect, it } from "vitest";
import { ToolCallDelta } from "./tool-call-delta";

describe("ToolCallDelta", () => {
	it("carries the fragment of arguments verbatim", () => {
		expect(new ToolCallDelta(0, '{"order').argumentsDelta).toBe('{"order');
	});

	it("opens a call when it brings the id or the name", () => {
		expect(new ToolCallDelta(0, "", "call-1", "refund").opensCall).toBe(true);
		expect(new ToolCallDelta(0, "", "call-1").opensCall).toBe(true);
	});

	it("continues a call when it brings arguments alone", () => {
		expect(new ToolCallDelta(0, 'Id": "42"}').opensCall).toBe(false);
	});

	it("keeps the index, which is what pairs fragments of parallel calls", () => {
		expect(new ToolCallDelta(2, "", "call-3", "search").index).toBe(2);
	});
});
