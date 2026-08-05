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
import { OpenAiRequestMapper } from "./openai-request-mapper";

const mapper = new OpenAiRequestMapper();
const CALL = ToolCallId.from("call-1");

describe("OpenAiRequestMapper", () => {
	it("carries the model name", () => {
		expect(mapper.toChatRequest("gpt-5", new ModelRequest([])).model).toBe("gpt-5");
	});

	it("puts the instructions in a system turn, before the conversation", () => {
		const request = new ModelRequest([new UserMessage("hi")], [], PromptInstructions.from("be brief"));

		const chat = mapper.toChatRequest("gpt-5", request);

		expect(chat.messages[0]).toEqual({ role: "system", content: "be brief" });
		expect(chat.messages[1]).toEqual({ role: "user", content: "hi" });
	});

	it("sends no system turn when there are no instructions", () => {
		const chat = mapper.toChatRequest("gpt-5", new ModelRequest([new UserMessage("hi")]));

		expect(chat.messages).toHaveLength(1);
	});

	it("sends no system turn for empty instructions", () => {
		const request = new ModelRequest([new UserMessage("hi")], [], PromptInstructions.from("   "));

		expect(mapper.toChatRequest("gpt-5", request).messages).toHaveLength(1);
	});

	it("maps a user turn and an assistant turn", () => {
		const request = new ModelRequest([new UserMessage("hi"), new AssistantMessage("hello")]);

		expect(mapper.toChatRequest("gpt-5", request).messages).toEqual([
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "hello" },
		]);
	});

	it("sends an attached image as a data URL part, before the words that ask about it", () => {
		const request = new ModelRequest([new UserMessage("what is this?", [MediaPart.image("image/png", "iVBORw0KGgo=")])]);

		expect(mapper.toChatRequest("gpt-5", request).messages).toEqual([
			{
				role: "user",
				content: [
					{ type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
					{ type: "text", text: "what is this?" },
				],
			},
		]);
	});

	it("leaves a message without attachments as a plain string", () => {
		const chat = mapper.toChatRequest("gpt-5", new ModelRequest([new UserMessage("hi")]));

		expect(chat.messages[0]?.content).toBe("hi");
	});

	it("keeps a call and its result paired by the same id", () => {
		const request = new ModelRequest([
			new ToolCallMessage(CALL, "refund", { orderId: "42" }),
			new ToolResultMessage(CALL, "refund", { ok: true }, false),
		]);

		const [call, result] = mapper.toChatRequest("gpt-5", request).messages;

		expect(call).toEqual({
			role: "assistant",
			tool_calls: [{ id: "call-1", type: "function", function: { name: "refund", arguments: '{"orderId":"42"}' } }],
		});
		expect(result).toEqual({ role: "tool", tool_call_id: "call-1", content: '{"ok":true}' });
	});

	it("declares tools with their schema", () => {
		const request = new ModelRequest([], [new ToolDeclaration("refund", "refunds an order", { type: "object" })]);

		expect(mapper.toChatRequest("gpt-5", request).tools).toEqual([
			{ type: "function", function: { name: "refund", description: "refunds an order", parameters: { type: "object" } } },
		]);
	});

	it("refuses a tool whose schema is not an object", () => {
		const request = new ModelRequest([], [new ToolDeclaration("refund", "refunds an order", "not a schema")]);

		expect(() => mapper.toChatRequest("gpt-5", request)).toThrow(InvalidJsonSchemaError);
	});

	it("refuses a tool whose schema is an array, which JSON Schema never is at the root", () => {
		const request = new ModelRequest([], [new ToolDeclaration("refund", "refunds an order", [])]);

		expect(() => mapper.toChatRequest("gpt-5", request)).toThrow(InvalidJsonSchemaError);
	});

	it("maps the generation options to the names the API uses", () => {
		const chat = mapper.toChatRequest("gpt-5", new ModelRequest([]), {
			temperature: 0.2,
			topP: 0.9,
			maxOutputTokens: 500,
			stopSequences: ["END"],
			frequencyPenalty: 0.1,
			presencePenalty: 0.3,
		});

		expect(chat.parameters).toEqual({
			temperature: 0.2,
			top_p: 0.9,
			max_completion_tokens: 500,
			stop: ["END"],
			frequency_penalty: 0.1,
			presence_penalty: 0.3,
		});
	});

	it("passes unknown body fields through, and lets typed options win over them", () => {
		const chat = mapper.toChatRequest("gpt-5", new ModelRequest([]), {
			temperature: 0.2,
			body: { temperature: 0.9, seed: 7 },
		});

		expect(chat.parameters.seed).toBe(7);
		expect(chat.parameters.temperature).toBe(0.2);
	});

	it("sends no generation options when none were declared", () => {
		expect(mapper.toChatRequest("gpt-5", new ModelRequest([])).parameters).toEqual({});
	});

	it("knows whether it carries tools", () => {
		const withTool = new ModelRequest([], [new ToolDeclaration("refund", "refunds an order", {})]);

		expect(mapper.toChatRequest("gpt-5", new ModelRequest([])).hasTools).toBe(false);
		expect(mapper.toChatRequest("gpt-5", withTool).hasTools).toBe(true);
	});
});
