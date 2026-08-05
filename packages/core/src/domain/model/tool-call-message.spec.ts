import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { ToolCallMessage } from "./tool-call-message";

const CALL = ToolCallId.from("call-1");

describe("ToolCallMessage", () => {
	it("keeps the call id, which is what pairs it with a result", () => {
		expect(new ToolCallMessage(CALL, "search", {}).callId.value).toBe("call-1");
	});

	it("renders arguments canonically, so key order cannot change the measurement", () => {
		const one = new ToolCallMessage(CALL, "search", { b: 2, a: 1 });
		const other = new ToolCallMessage(CALL, "search", { a: 1, b: 2 });

		expect(one.text).toBe(other.text);
	});

	it("names the tool in the text", () => {
		expect(new ToolCallMessage(CALL, "search", { q: "x" }).text).toBe('search({"q":"x"})');
	});

	it("answers to the tool call role", () => {
		expect(new ToolCallMessage(CALL, "search", {}).role).toBe("tool-call");
	});
});
