import {
	AssistantMessage,
	ModelRequest,
	PromptInstructions,
	ToolCallId,
	ToolCallMessage,
	ToolDeclaration,
	ToolResultMessage,
	UserMessage,
} from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { InvalidJsonSchemaError } from "./errors/invalid-json-schema.error";
import { GeminiRequestMapper } from "./gemini-request-mapper";

const mapper = new GeminiRequestMapper();
const CALL = ToolCallId.from("call-1");

describe("GeminiRequestMapper", () => {
	it("carries the model name", () => {
		expect(mapper.toRequest("gemini-2.5-flash", new ModelRequest([])).model).toBe("gemini-2.5-flash");
	});

	it("maps a user turn and an assistant turn to the roles Gemini uses", () => {
		const request = new ModelRequest([new UserMessage("hi"), new AssistantMessage("hello")]);

		expect(mapper.toRequest("gemini-2.5-flash", request).contents).toEqual([
			{ role: "user", parts: [{ text: "hi" }] },
			{ role: "model", parts: [{ text: "hello" }] },
		]);
	});

	it("puts the prompt in the config, since Gemini has no system role", () => {
		const request = new ModelRequest([new UserMessage("hi")], [], PromptInstructions.from("be brief"));

		const mapped = mapper.toRequest("gemini-2.5-flash", request);

		expect(mapped.config.systemInstruction).toBe("be brief");
		expect(mapped.contents).toHaveLength(1);
	});

	it("sends no prompt when there is none, and none for an empty one", () => {
		expect(mapper.toRequest("gemini-2.5-flash", new ModelRequest([])).config.systemInstruction).toBeUndefined();
		const empty = new ModelRequest([], [], PromptInstructions.from("  "));
		expect(mapper.toRequest("gemini-2.5-flash", empty).config.systemInstruction).toBeUndefined();
	});

	it("keeps a call and its result paired by the same id", () => {
		const request = new ModelRequest([
			new ToolCallMessage(CALL, "refund", { orderId: "42" }),
			new ToolResultMessage(CALL, "refund", { ok: true }, false),
		]);

		expect(mapper.toRequest("gemini-2.5-flash", request).contents).toEqual([
			{ role: "model", parts: [{ functionCall: { id: "call-1", name: "refund", args: { orderId: "42" } } }] },
			{ role: "user", parts: [{ functionResponse: { id: "call-1", name: "refund", response: { ok: true } } }] },
		]);
	});

	it("declares tools under one function declaration list", () => {
		const request = new ModelRequest([], [new ToolDeclaration("refund", "refunds an order", { type: "object" })]);

		expect(mapper.toRequest("gemini-2.5-flash", request).config.tools).toEqual([
			{
				functionDeclarations: [
					{ name: "refund", description: "refunds an order", parametersJsonSchema: { type: "object" } },
				],
			},
		]);
	});

	it("sends no tools field when there are none", () => {
		expect(mapper.toRequest("gemini-2.5-flash", new ModelRequest([])).config.tools).toBeUndefined();
	});

	it("refuses a tool whose schema is not an object", () => {
		const request = new ModelRequest([], [new ToolDeclaration("refund", "refunds", "not a schema")]);

		expect(() => mapper.toRequest("gemini-2.5-flash", request)).toThrow(InvalidJsonSchemaError);
	});

	it("maps the generation options", () => {
		const mapped = mapper.toRequest("gemini-2.5-flash", new ModelRequest([]), {
			temperature: 0.2,
			topP: 0.9,
			topK: 40,
			maxOutputTokens: 500,
			stopSequences: ["END"],
			frequencyPenalty: 0.1,
			presencePenalty: 0.3,
		});

		expect(mapped.config.temperature).toBe(0.2);
		expect(mapped.config.topP).toBe(0.9);
		expect(mapped.config.topK).toBe(40);
		expect(mapped.config.maxOutputTokens).toBe(500);
		expect(mapped.config.stopSequences).toEqual(["END"]);
		expect(mapped.config.frequencyPenalty).toBe(0.1);
		expect(mapped.config.presencePenalty).toBe(0.3);
	});

	it("carries billing labels and a cached content handle", () => {
		const mapped = mapper.toRequest("gemini-2.5-flash", new ModelRequest([]), {
			labels: { team: "support" },
			cachedContent: "cachedContents/abc",
		});

		expect(mapped.config.labels).toEqual({ team: "support" });
		expect(mapped.config.cachedContent).toBe("cachedContents/abc");
	});

	it("passes unknown config fields through, and lets typed options win over them", () => {
		const mapped = mapper.toRequest("gemini-2.5-flash", new ModelRequest([]), {
			temperature: 0.2,
			config: { temperature: 0.9, thinkingConfig: { thinkingBudget: 100 } },
		});

		expect(mapped.config.temperature).toBe(0.2);
		expect(mapped.config.thinkingConfig).toEqual({ thinkingBudget: 100 });
	});

	it("sends the thought signature back next to the call, which is where Gemini put it", () => {
		const request = new ModelRequest([
			new ToolCallMessage(ToolCallId.from("c-1"), "stock_of", { sku: "SKU-9" }, "opaque-token"),
		]);

		const contents = new GeminiRequestMapper().toRequest("gemini-3.5-flash-lite", request).contents;
		const part = contents[0]?.parts?.[0];

		expect(Reflect.get(Object(part), "thoughtSignature")).toBe("opaque-token");
		expect(Reflect.get(Object(Reflect.get(Object(part), "functionCall")), "name")).toBe("stock_of");
	});

	it("omits the field entirely for a call that never carried one", () => {
		const request = new ModelRequest([new ToolCallMessage(ToolCallId.from("c-1"), "stock_of", { sku: "SKU-9" })]);

		const part = new GeminiRequestMapper().toRequest("gemini-3.5-flash-lite", request).contents[0]?.parts?.[0];

		expect(Object.keys(Object(part))).toEqual(["functionCall"]);
	});
});
