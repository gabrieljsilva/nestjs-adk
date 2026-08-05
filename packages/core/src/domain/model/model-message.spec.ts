import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { AssistantMessage } from "./assistant-message";
import { ModelMessage } from "./model-message";
import { ToolCallMessage } from "./tool-call-message";
import { ToolResultMessage } from "./tool-result-message";
import { UserMessage } from "./user-message";

const CALL = ToolCallId.from("call-1");

describe("ModelMessage", () => {
	it("is the common type of every conversational entry", () => {
		const messages: ModelMessage[] = [
			new UserMessage("hi"),
			new AssistantMessage("hello"),
			new ToolCallMessage(CALL, "search", {}),
			new ToolResultMessage(CALL, "search", {}, false),
		];

		expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "tool-call", "tool-result"]);
	});

	it("gives every entry a textual form, which is what measurement reads", () => {
		const messages: ModelMessage[] = [
			new UserMessage("hi"),
			new ToolCallMessage(CALL, "search", { q: "a" }),
			new ToolResultMessage(CALL, "search", { hits: 1 }, false),
		];

		for (const message of messages) expect(message.text.length).toBeGreaterThan(0);
	});
});
