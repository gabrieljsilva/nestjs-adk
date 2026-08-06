import {
	AssistantMessage,
	MediaPart,
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

	it("sends an attached image inline, before the words that ask about it", () => {
		const request = new ModelRequest([new UserMessage("what is this?", [MediaPart.image("image/png", "iVBORw0KGgo=")])]);

		expect(mapper.toRequest("gemini-2.5-flash", request).contents).toEqual([
			{
				role: "user",
				parts: [{ inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } }, { text: "what is this?" }],
			},
		]);
	});

	it("sends every attachment of the message, in the order they were attached", () => {
		const request = new ModelRequest([
			new UserMessage("compare", [MediaPart.image("image/png", "iVBORw0KGgo="), MediaPart.image("image/jpeg", "aGk=")]),
		]);

		const parts = mapper.toRequest("gemini-2.5-flash", request).contents[0]?.parts ?? [];

		expect(parts).toHaveLength(3);
		expect(parts[0]?.inlineData?.mimeType).toBe("image/png");
		expect(parts[1]?.inlineData?.mimeType).toBe("image/jpeg");
	});

	it("sends a linked image as file data, which is the field that names instead of carrying", () => {
		const request = new ModelRequest([
			new UserMessage("what is this?", [MediaPart.link("https://cdn.example/photo.png", "image/png")]),
		]);

		expect(mapper.toRequest("gemini-2.5-flash", request).contents).toEqual([
			{
				role: "user",
				parts: [
					{ fileData: { fileUri: "https://cdn.example/photo.png", mimeType: "image/png" } },
					{ text: "what is this?" },
				],
			},
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

	/**
	 * Calls asked for together go back as one turn, which is how they arrived.
	 *
	 * Gemini 3 signs an answer on its first function call part and then checks that a turn
	 * carrying calls has that signature. One journal message per call turned into one Gemini
	 * turn per call, and the second one, unsigned, came back as a 400 naming the tool. Found
	 * against the real provider, on a question that needed two lookups.
	 */
	it("folds parallel calls into a single model turn, signature and all", () => {
		const request = new ModelRequest([
			new ToolCallMessage(ToolCallId.from("c-1"), "find_order", { orderId: "A-1" }, "opaque-token"),
			new ToolCallMessage(ToolCallId.from("c-2"), "refund_limit", { plan: "gold" }),
		]);

		const contents = mapper.toRequest("gemini-3.5-flash-lite", request).contents;

		expect(contents).toHaveLength(1);
		expect(contents[0]?.parts).toHaveLength(2);
		expect(Reflect.get(Object(contents[0]?.parts?.[0]), "thoughtSignature")).toBe("opaque-token");
	});

	it("folds the results of parallel calls into a single user turn", () => {
		const request = new ModelRequest([
			new ToolResultMessage(ToolCallId.from("c-1"), "find_order", { total: 349 }, false),
			new ToolResultMessage(ToolCallId.from("c-2"), "refund_limit", { limit: 1437 }, false),
		]);

		const contents = mapper.toRequest("gemini-3.5-flash-lite", request).contents;

		expect(contents).toHaveLength(1);
		expect(contents[0]?.parts).toHaveLength(2);
		expect(contents[0]?.role).toBe("user");
	});

	/**
	 * The context arrives paired, and Gemini wants the answer back whole.
	 *
	 * Two calls asked for at once reach here as call, result, call, result, because a call
	 * and its answer are one unit upstream. The unsigned one belongs to the signed answer
	 * before it, and its result belongs with the results already grouped: sending it as a
	 * turn of its own is the 400 this exists to avoid.
	 */
	it("puts an unsigned call back into the signed answer it came from", () => {
		const request = new ModelRequest([
			new ToolCallMessage(ToolCallId.from("c-1"), "find_order", { orderId: "A-1" }, "opaque-token"),
			new ToolResultMessage(ToolCallId.from("c-1"), "find_order", { total: 349 }, false),
			new ToolCallMessage(ToolCallId.from("c-2"), "refund_limit", { plan: "gold" }),
			new ToolResultMessage(ToolCallId.from("c-2"), "refund_limit", { limit: 1437 }, false),
		]);

		const contents = mapper.toRequest("gemini-3.5-flash-lite", request).contents;

		expect(contents).toHaveLength(2);
		expect(contents[0]?.role).toBe("model");
		expect(contents[0]?.parts).toHaveLength(2);
		expect(contents[1]?.parts).toHaveLength(2);
	});

	/**
	 * A model that signs nothing is a different conversation.
	 *
	 * On 2.5 no call carries a signature, so folding by absence would glue every call of a
	 * session into one turn. Only an answer the provider signed can adopt an unsigned call.
	 */
	it("leaves calls alone when the provider signed none of them", () => {
		const request = new ModelRequest([
			new ToolCallMessage(ToolCallId.from("c-1"), "find_order", { orderId: "A-1" }),
			new ToolResultMessage(ToolCallId.from("c-1"), "find_order", { total: 349 }, false),
			new ToolCallMessage(ToolCallId.from("c-2"), "refund_limit", { plan: "gold" }),
		]);

		expect(mapper.toRequest("gemini-2.5-flash", request).contents).toHaveLength(3);
	});

	it("keeps a call and its result in turns of their own, because they are different turns", () => {
		const request = new ModelRequest([
			new ToolCallMessage(CALL, "find_order", { orderId: "A-1" }),
			new ToolResultMessage(CALL, "find_order", { total: 349 }, false),
			new ToolCallMessage(ToolCallId.from("c-2"), "refund_limit", { plan: "gold" }),
		]);

		expect(mapper.toRequest("gemini-3.5-flash-lite", request).contents).toHaveLength(3);
	});
});
