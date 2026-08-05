import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { ToolResultMessage } from "./tool-result-message";

const CALL = ToolCallId.from("call-1");

describe("ToolResultMessage", () => {
	it("keeps the call id of the call it answers", () => {
		expect(new ToolResultMessage(CALL, "search", {}, false).callId.value).toBe("call-1");
	});

	it("states failure in the text the model reads", () => {
		expect(new ToolResultMessage(CALL, "search", { error: "timeout" }, true).text).toContain("failed");
	});

	it("renders output canonically", () => {
		const one = new ToolResultMessage(CALL, "search", { b: 2, a: 1 }, false);
		const other = new ToolResultMessage(CALL, "search", { a: 1, b: 2 }, false);

		expect(one.text).toBe(other.text);
	});

	it("answers to the tool result role", () => {
		expect(new ToolResultMessage(CALL, "search", {}, false).role).toBe("tool-result");
	});
});
