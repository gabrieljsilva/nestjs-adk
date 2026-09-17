import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { AssistantMessage } from "./assistant-message.value-object";
import { ModelMessage } from "./model-message.value-object";
import { ToolCallMessage } from "./tool-call-message.value-object";
import { ToolResultMessage } from "./tool-result-message.value-object";
import { UserMessage } from "./user-message.value-object";

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
