import { describe, expect, it } from "vitest";
import { AssistantMessage } from "./assistant-message";
import { ModelMessage } from "./model-message";

describe("AssistantMessage", () => {
	it("carries the answer unchanged", () => {
		expect(new AssistantMessage("done").text).toBe("done");
	});

	it("answers to the assistant role", () => {
		expect(new AssistantMessage("done").role).toBe("assistant");
	});

	it("is a model message", () => {
		expect(new AssistantMessage("done")).toBeInstanceOf(ModelMessage);
	});
});
