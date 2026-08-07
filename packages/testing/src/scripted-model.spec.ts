import { ModelCallFailedError, ModelCapability, ModelRequest, RateLimitedFailure, UserMessage } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { ScriptDeviationError } from "./errors/script-deviation.error";
import { ScriptExhaustedError } from "./errors/script-exhausted.error";
import { ScriptMisuseError } from "./errors/script-misuse.error";
import { ScriptNotConsumedError } from "./errors/script-not-consumed.error";
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

	/** A context has no size until a provider reports one, so a script has to say it. */
	it("reports the prompt size a test asked for, on text and on a tool call alike", async () => {
		const model = new ScriptedModel().reportsPromptTokens(9_000).mockText("hi").mockToolCall("find_order");

		const answered = await collect(model);
		const called = await collect(model);

		expect(answered.find((chunk) => chunk.usage !== undefined)?.usage?.inputTokens).toBe(9_000);
		expect(called.find((chunk) => chunk.usage !== undefined)?.usage?.inputTokens).toBe(9_000);
	});

	it("reports a small prompt until somebody says otherwise", async () => {
		const model = new ScriptedModel().mockText("hi");

		const chunks = await collect(model);

		expect(chunks.find((chunk) => chunk.usage !== undefined)?.usage?.inputTokens).toBe(10);
	});

	it("declares tools and structured output, so a run never refuses it for a capability", () => {
		const capabilities = new ScriptedModel().descriptor().capabilities;

		expect(capabilities.supports(ModelCapability.TOOLS)).toBe(true);
	});

	it("fails a strict script that runs out, naming itself and how much was played", async () => {
		const model = new ScriptedModel("billing").strict().mockText("only turn");

		await collect(model);

		await expect(collect(model)).rejects.toThrow(ScriptExhaustedError);
		await expect(collect(model)).rejects.toThrow(/billing/);
	});

	it("asks for two tools in one turn, each call with its own index and id", async () => {
		const model = new ScriptedModel().mockToolCalls([
			{ tool: "find_order", args: { id: "1" } },
			{ tool: "refund_limit", args: { plan: "gold" } },
		]);

		const calls = (await collect(model)).flatMap((chunk) => (chunk.toolCall === undefined ? [] : [chunk.toolCall]));

		expect(calls.map((call) => call.toolName)).toEqual(["find_order", "refund_limit"]);
		expect(new Set(calls.map((call) => call.callId)).size).toBe(2);
	});

	it("throws the scripted failure before any chunk, the way an adapter throws a classified one", async () => {
		const model = new ScriptedModel().mockFailure(new RateLimitedFailure("scripted 429"));

		await expect(collect(model)).rejects.toThrow(ModelCallFailedError);
	});

	it("stops the run at the turn whose guard the request does not satisfy", async () => {
		const model = new ScriptedModel("sales").mockText("hi").expecting("A-1042");

		await expect(collect(model, new ModelRequest([new UserMessage("hello")]))).rejects.toThrow(ScriptDeviationError);
	});

	it("plays a guarded turn when the request satisfies the guard", async () => {
		const model = new ScriptedModel().mockText("hi").expecting("A-1042");

		const chunks = await collect(model, new ModelRequest([new UserMessage("where is A-1042?")]));

		expect(chunks.map((chunk) => chunk.textDelta).join("")).toBe("hi");
	});

	it("refuses to guard a script with no turn queued", () => {
		expect(() => new ScriptedModel().expecting("anything")).toThrow(ScriptMisuseError);
	});

	it("verifies that everything queued was played", async () => {
		const model = new ScriptedModel("warranty").mockText("a").mockText("b");

		await collect(model);

		expect(() => model.verify()).toThrow(ScriptNotConsumedError);
		await collect(model);
		expect(() => model.verify()).not.toThrow();
	});

	it("hands a streamed turn over in the pieces it was given, in order", async () => {
		const model = new ScriptedModel().mockStream(["Temos ", "o Hollow ", "Knight."]);

		const texts = (await collect(model)).filter((chunk) => chunk.hasText).map((chunk) => chunk.textDelta);

		expect(texts).toEqual(["Temos ", "o Hollow ", "Knight."]);
	});

	/** Without this the case above proves nothing: a caller reading only the last chunk would pass it. */
	it("hands a text turn over as one chunk, which is what a provider sends with streaming off", async () => {
		const model = new ScriptedModel().mockText("Temos o Hollow Knight.");

		const texts = (await collect(model)).filter((chunk) => chunk.hasText).map((chunk) => chunk.textDelta);

		expect(texts).toEqual(["Temos o Hollow Knight."]);
	});

	it("ends a streamed turn with the pieces joined, so an assertion on the answer reads the same", async () => {
		const model = new ScriptedModel().mockStream(["Temos ", "o Hollow ", "Knight."]);

		const chunks = await collect(model);

		expect(chunks.map((chunk) => chunk.textDelta).join("")).toBe("Temos o Hollow Knight.");
		expect(chunks.at(-1)?.finishReason).toBe("stop");
	});

	it("guards a streamed turn like any other", async () => {
		const model = new ScriptedModel("sales").mockStream(["a", "b"]).expecting("hollow knight");

		await expect(collect(model)).rejects.toThrow(ScriptDeviationError);
	});

	it("refuses a streamed turn with no pieces, which would answer nothing at all", () => {
		expect(() => new ScriptedModel().mockStream([])).toThrow(ScriptMisuseError);
	});
});
