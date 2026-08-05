import { describe, expect, it } from "vitest";
import { ModelMessage } from "./model-message";
import { UserMessage } from "./user-message";

describe("UserMessage", () => {
	it("carries the text unchanged", () => {
		expect(new UserMessage("  spaced  ").text).toBe("  spaced  ");
	});

	it("answers to the user role", () => {
		expect(new UserMessage("hi").role).toBe("user");
	});

	it("is a model message", () => {
		expect(new UserMessage("hi")).toBeInstanceOf(ModelMessage);
	});
});
