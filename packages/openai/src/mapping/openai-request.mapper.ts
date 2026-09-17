import {
	AssistantMessage,
	type ModelMessage,
	type ModelRequest,
	ToolCallMessage,
	ToolResultMessage,
	UserMessage,
} from "@nestjs-adk/core";
import type {
	ChatCompletionAssistantMessageParam,
	ChatCompletionContentPart,
	ChatCompletionFunctionTool,
	ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { InvalidJsonSchemaError } from "../errors/invalid-json-schema.error";
import type { OpenAiOptions } from "../model/openai.options";
import { StrictSchemaValidator } from "../model/strict-schema-validator.adapter";
import { OpenAiChatRequest } from "./openai-chat-request.value-object";

type ReasonedToolCallsTurn = ChatCompletionAssistantMessageParam & { reasoning_content?: string };

export class OpenAiRequestMapper {
	public constructor(private readonly strict: StrictSchemaValidator = new StrictSchemaValidator()) {}

	public toChatRequest(model: string, request: ModelRequest, options: OpenAiOptions = {}): OpenAiChatRequest {
		return new OpenAiChatRequest(
			model,
			this.buildMessages(request, this.replaysReasoning(options)),
			request.tools.map((tool) => this.buildTool(tool.name, tool.description, tool.parameters)),
			{ ...this.buildParameters(options), ...this.buildResponseFormat(request) },
		);
	}

	private buildResponseFormat(request: ModelRequest): Record<string, unknown> {
		const schema = request.outputSchema;
		if (schema === undefined) return {};
		if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
			throw new InvalidJsonSchemaError("the requested output", this.readTypeName(schema));
		}
		this.strict.validate(schema);
		return { response_format: { type: "json_schema", json_schema: { name: "response", schema, strict: true } } };
	}

	private replaysReasoning(options: OpenAiOptions): boolean {
		return options.replaysReasoning ?? options.baseURL !== undefined;
	}

	private buildMessages(request: ModelRequest, replaysReasoning: boolean): ChatCompletionMessageParam[] {
		const messages: ChatCompletionMessageParam[] = [];
		const instructions = request.instructions;
		if (instructions !== undefined && !instructions.isEmpty) {
			messages.push({ role: "system", content: instructions.text });
		}
		let calls: ToolCallMessage[] = [];
		for (const message of request.messages) {
			if (message instanceof ToolCallMessage) {
				calls.push(message);
				continue;
			}
			if (calls.length > 0) messages.push(this.buildCalls(calls, replaysReasoning));
			calls = [];
			messages.push(this.buildMessage(message));
		}
		if (calls.length > 0) messages.push(this.buildCalls(calls, replaysReasoning));
		return messages;
	}

	private buildCalls(calls: readonly ToolCallMessage[], replaysReasoning: boolean): ReasonedToolCallsTurn {
		const reasoning = calls.find((message) => message.signature !== undefined)?.signature;
		return {
			role: "assistant",
			content: "",
			tool_calls: calls.map((message) => ({
				id: message.callId.value,
				type: "function",
				function: { name: message.toolName, arguments: JSON.stringify(message.args) },
			})),
			...(replaysReasoning && reasoning !== undefined ? { reasoning_content: reasoning } : {}),
		};
	}

	private buildMessage(message: ModelMessage): ChatCompletionMessageParam {
		if (message instanceof AssistantMessage) return { role: "assistant", content: message.text };
		if (message instanceof ToolResultMessage) {
			return { role: "tool", tool_call_id: message.callId.value, content: JSON.stringify(message.output) };
		}
		if (message instanceof UserMessage) return { role: "user", content: this.buildUserContent(message) };
		return { role: "user", content: message.text };
	}

	private buildUserContent(message: UserMessage): string | ChatCompletionContentPart[] {
		if (!message.hasMedia) return message.text;
		const media: ChatCompletionContentPart[] = message.media.map((part) => ({
			type: "image_url",
			image_url: { url: part.toUrl() },
		}));
		return [...media, { type: "text", text: message.text }];
	}

	private buildTool(name: string, description: string, parameters: unknown): ChatCompletionFunctionTool {
		if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
			throw new InvalidJsonSchemaError(name, this.readTypeName(parameters));
		}
		const schema: Record<string, unknown> = {};
		for (const key of Object.keys(parameters)) schema[key] = Reflect.get(parameters, key);
		return { type: "function", function: { name, description, parameters: schema } };
	}

	private readTypeName(value: unknown): string {
		if (value === null) return "null";
		return Array.isArray(value) ? "array" : typeof value;
	}

	private buildParameters(options: OpenAiOptions): Record<string, unknown> {
		const parameters: Record<string, unknown> = { ...options.body };
		if (options.temperature !== undefined) parameters.temperature = options.temperature;
		if (options.topP !== undefined) parameters.top_p = options.topP;
		if (options.maxOutputTokens !== undefined) parameters.max_completion_tokens = options.maxOutputTokens;
		if (options.stopSequences !== undefined) parameters.stop = options.stopSequences;
		if (options.frequencyPenalty !== undefined) parameters.frequency_penalty = options.frequencyPenalty;
		if (options.presencePenalty !== undefined) parameters.presence_penalty = options.presencePenalty;
		return parameters;
	}
}
