import { describe, expect, it } from "vitest";
import { ToolCallDelta } from "../../domain/model/tool-call-delta";
import { PartialToolCall } from "./partial-tool-call";

describe("PartialToolCall", () => {
	it("starts empty", () => {
		const partial = new PartialToolCall();

		expect(partial.argumentsText).toBe("");
		expect(partial.callId).toBeUndefined();
		expect(partial.toolName).toBeUndefined();
	});

	it("takes the id and the name from the delta that opens the call", () => {
		const partial = new PartialToolCall().with(new ToolCallDelta(0, "", "call-1", "refund"));

		expect(partial.callId).toBe("call-1");
		expect(partial.toolName).toBe("refund");
	});

	it("accumulates argument fragments in the order they arrived", () => {
		const partial = new PartialToolCall()
			.with(new ToolCallDelta(0, '{"orderId"', "call-1", "refund"))
			.with(new ToolCallDelta(0, ': "42"}'));

		expect(partial.argumentsText).toBe('{"orderId": "42"}');
	});

	it("keeps the id and the name once they arrived", () => {
		const partial = new PartialToolCall()
			.with(new ToolCallDelta(0, "", "call-1", "refund"))
			.with(new ToolCallDelta(0, "{}"));

		expect(partial.callId).toBe("call-1");
		expect(partial.toolName).toBe("refund");
	});

	it("does not mutate the value it was accumulated from", () => {
		const first = new PartialToolCall().with(new ToolCallDelta(0, "{"));

		first.with(new ToolCallDelta(0, "}"));

		expect(first.argumentsText).toBe("{");
	});

	it("parses complete arguments into an object", () => {
		const partial = new PartialToolCall().with(new ToolCallDelta(0, '{"orderId":"42"}', "call-1", "refund"));

		expect(partial.parseArguments()).toEqual({ orderId: "42" });
	});

	it("reads a call with no arguments as an empty object", () => {
		expect(new PartialToolCall().parseArguments()).toEqual({});
		expect(new PartialToolCall("   ").parseArguments()).toEqual({});
	});

	it("answers nothing for truncated JSON, rather than half a request", () => {
		expect(new PartialToolCall('{"orderId":').parseArguments()).toBeUndefined();
	});

	it("answers nothing for JSON that is not an object", () => {
		expect(new PartialToolCall("[1,2]").parseArguments()).toBeUndefined();
		expect(new PartialToolCall('"text"').parseArguments()).toBeUndefined();
		expect(new PartialToolCall("null").parseArguments()).toBeUndefined();
	});
});
