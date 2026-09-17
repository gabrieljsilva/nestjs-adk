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

/** An assistant turn as DeepSeek reads it back: the calls, and the thought that led to them. */
type ReasonedToolCallsTurn = ChatCompletionAssistantMessageParam & { reasoning_content?: string };

/**
 * Turns a neutral request into a Chat Completions body.
 *
 * Chat Completions and not Responses: every OpenAI compatible gateway implements the
 * former, and this adapter exists to reach them as much as to reach OpenAI itself.
 *
 * The causal pair survives the mapping. A tool call becomes an assistant turn carrying
 * `tool_calls`, its result becomes a `tool` turn carrying the same `tool_call_id`, and
 * the model reads back exactly the exchange the journal recorded. Calls the model made in
 * one breath are one assistant turn with several `tool_calls`, which is the shape it
 * produced them in: a thinking model attaches its reasoning to that turn, and split in
 * two, the second half would be a turn it never reasoned about.
 */
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

	/**
	 * Structured output travels as a json schema response format, which is what makes the
	 * provider enforce it. `strict` is what makes enforcing mean the schema rather than
	 * only valid JSON, and `StrictSchemaValidator` checks the claim before it is made.
	 */
	private buildResponseFormat(request: ModelRequest): Record<string, unknown> {
		const schema = request.outputSchema;
		if (schema === undefined) return {};
		if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
			throw new InvalidJsonSchemaError("the requested output", this.readTypeName(schema));
		}
		this.strict.validate(schema);
		return { response_format: { type: "json_schema", json_schema: { name: "response", schema, strict: true } } };
	}

	/** Explicit wins; otherwise a compatible endpoint replays and the official API does not. */
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
		// `content` travels empty rather than absent: DeepSeek validates the turn as the message it
		// returned, which always carried the field, and refuses the shape without it.
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

	/**
	 * A message with an image stops being a string and becomes parts.
	 *
	 * One field carries both ways an image arrives: `image_url.url` is either the address
	 * the provider fetches or the data URL the bytes became, and OpenAI documents it as
	 * exactly that. The words follow the images.
	 */
	private buildUserContent(message: UserMessage): string | ChatCompletionContentPart[] {
		if (!message.hasMedia) return message.text;
		const media: ChatCompletionContentPart[] = message.media.map((part) => ({
			type: "image_url",
			image_url: { url: part.toUrl() },
		}));
		return [...media, { type: "text", text: message.text }];
	}

	/** A tool schema arrives as `unknown` and is checked here, never sent on trust. */
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

	/** Typed options win over the passthrough body, so a stray key cannot silently override them. */
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
