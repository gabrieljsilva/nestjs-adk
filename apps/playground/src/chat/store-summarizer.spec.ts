import { AssistantMessage, ContextBlock, SessionRevision, UserMessage } from "@nestjs-adk/core";
import { ScriptedModel } from "@nestjs-adk/testing";
import { describe, expect, it } from "vitest";
import { StoreSummarizer } from "./store-summarizer";

const REVISION = SessionRevision.initial();

function said(text: string): ContextBlock {
	return ContextBlock.conversation(new UserMessage(text), REVISION);
}

function answered(text: string): ContextBlock {
	return ContextBlock.conversation(new AssistantMessage(text), REVISION);
}

describe("StoreSummarizer", () => {
	it("answers what the model wrote, trimmed", async () => {
		const model = new ScriptedModel().mockText("  O cliente perguntou pelo pedido A-1042.  ");

		const summary = await new StoreSummarizer(model).summarize([said("E o pedido A-1042?")]);

		expect(summary).toBe("O cliente perguntou pelo pedido A-1042.");
	});

	it("hands the model every turn it is about to drop, labelled by who said it", async () => {
		const model = new ScriptedModel().mockText("resumo");

		await new StoreSummarizer(model).summarize([said("Quero devolver o A-1042"), answered("Vou verificar.")]);

		const question = model.requests.at(0)?.messages.at(0)?.text ?? "";
		expect(question).toContain("user: Quero devolver o A-1042");
		expect(question).toContain("assistant: Vou verificar.");
	});

	/** A call that summarizes nothing is a call nobody needed, and this one costs money. */
	it("never calls the model when there is nothing to summarize", async () => {
		const model = new ScriptedModel().mockText("resumo");

		const summary = await new StoreSummarizer(model).summarize([said("   ")]);

		expect(summary).toBe("");
		expect(model.requests).toHaveLength(0);
	});

	it("asks for a summary short enough that it never becomes the context it replaced", async () => {
		const model = new ScriptedModel().mockText("resumo");

		await new StoreSummarizer(model).summarize([said("oi")]);

		expect(model.requests.at(0)?.instructions?.text).toContain("quatro frases");
	});
});
