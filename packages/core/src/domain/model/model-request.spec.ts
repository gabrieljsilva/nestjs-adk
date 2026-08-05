import { describe, expect, it } from "vitest";
import { PromptInstructions } from "../prompt/prompt-instructions";
import { ModelRequest } from "./model-request";
import { ToolDeclaration } from "./tool-declaration";
import { UserMessage } from "./user-message";

describe("ModelRequest", () => {
	it("carries the messages of the turn", () => {
		expect(new ModelRequest([new UserMessage("hi")]).messages).toHaveLength(1);
	});

	it("offers no tools and no instructions unless it was given them", () => {
		const request = new ModelRequest([]);

		expect(request.tools).toEqual([]);
		expect(request.hasTools).toBe(false);
		expect(request.instructions).toBeUndefined();
	});

	it("knows whether it carries tools", () => {
		expect(new ModelRequest([], [new ToolDeclaration("refund", "refunds", {})]).hasTools).toBe(true);
	});

	it("carries the instructions when it was given them", () => {
		expect(new ModelRequest([], [], PromptInstructions.from("be brief")).instructions?.text).toBe("be brief");
	});

	it("wants prose unless a shape was asked for", () => {
		expect(new ModelRequest([]).wantsStructuredOutput).toBe(false);
		expect(new ModelRequest([], [], undefined, { type: "object" }).wantsStructuredOutput).toBe(true);
	});
});
