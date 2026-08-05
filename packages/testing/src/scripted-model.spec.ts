import { ModelCapability, ModelRequest, UserMessage } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { ScriptedModel } from "./scripted-model";

async function collect(model: ScriptedModel, request = new ModelRequest([new UserMessage("hi")])) {
	const chunks = [];
	for await (const chunk of model.generate(request)) chunks.push(chunk);
	return chunks;
}

describe("ScriptedModel", () => {
	it("answers the words it was told to, in order", async () => {
		const model = new ScriptedModel().mockText("first").mockText("second");

		expect((await collect(model)).map((chunk) => chunk.textDelta).join("")).toBe("first");
		expect((await collect(model)).map((chunk) => chunk.textDelta).join("")).toBe("second");
	});

	it("asks for the tool it was told to, with the arguments it was given", async () => {
		const model = new ScriptedModel().mockToolCall("lookup_order", { orderId: "42" });

		const call = (await collect(model)).find((chunk) => chunk.toolCall !== undefined)?.toolCall;

		expect(call?.toolName).toBe("lookup_order");
		expect(JSON.parse(call?.argumentsDelta ?? "{}")).toEqual({ orderId: "42" });
	});

	it("answers a default once the script runs out, rather than hanging a run", async () => {
		const model = new ScriptedModel();

		expect((await collect(model)).map((chunk) => chunk.textDelta).join("")).toBe("done");
	});

	it("keeps every request, because that is usually the real assertion", async () => {
		const model = new ScriptedModel().mockText("hi");
		const request = new ModelRequest([new UserMessage("what is my order?")]);

		await collect(model, request);

		expect(model.requests).toEqual([request]);
	});

	it("says how much script is left", () => {
		const model = new ScriptedModel().mockText("a").mockText("b");

		expect(model.pending).toBe(2);
	});

	it("declares tools and structured output, so a run never refuses it for a capability", () => {
		const capabilities = new ScriptedModel().descriptor().capabilities;

		expect(capabilities.supports(ModelCapability.TOOLS)).toBe(true);
	});
});
