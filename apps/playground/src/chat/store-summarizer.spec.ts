import { AssistantMessage, ContextBlock, SessionRevision, UserMessage } from "@nestjs-adk/core";
import { ScriptedModel } from "@nestjs-adk/testing";
import { describe, expect, it } from "vitest";
import { StoreSummarizer } from "./store-summarizer";

describe("StoreSummarizer", () => {
	it("answers what the model wrote, trimmed", async () => {
		const model = new ScriptedModel().mockText("  The customer asked about order A-1042.  ");

		const summary = await new StoreSummarizer(model).summarize([
			ContextBlock.conversation(new UserMessage("What about order A-1042?"), SessionRevision.initial()),
		]);

		expect(summary).toBe("The customer asked about order A-1042.");
	});

	it("hands the model every turn it is about to drop, labelled by who said it", async () => {
		const model = new ScriptedModel().mockText("summary");

		await new StoreSummarizer(model).summarize([
			ContextBlock.conversation(new UserMessage("I want to return A-1042"), SessionRevision.initial()),
			ContextBlock.conversation(new AssistantMessage("I will check."), SessionRevision.initial()),
		]);

		const question = model.requests.at(0)?.messages.at(0)?.text ?? "";
		expect(question).toContain("user: I want to return A-1042");
		expect(question).toContain("assistant: I will check.");
	});

	/** A call that summarizes nothing is a call nobody needed, and this one costs money. */
	it("never calls the model when there is nothing to summarize", async () => {
		const model = new ScriptedModel().mockText("summary");

		const summary = await new StoreSummarizer(model).summarize([
			ContextBlock.conversation(new UserMessage("   "), SessionRevision.initial()),
		]);

		expect(summary).toBe("");
		expect(model.requests).toHaveLength(0);
	});

	it("asks for a summary short enough that it never becomes the context it replaced", async () => {
		const model = new ScriptedModel().mockText("summary");

		await new StoreSummarizer(model).summarize([
			ContextBlock.conversation(new UserMessage("hello"), SessionRevision.initial()),
		]);

		expect(model.requests.at(0)?.instructions?.text).toContain("four sentences");
	});
});
