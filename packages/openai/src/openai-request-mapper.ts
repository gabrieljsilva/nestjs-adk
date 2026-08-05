import {
	AssistantMessage,
	type ModelMessage,
	type ModelRequest,
	ToolCallMessage,
	ToolResultMessage,
	UserMessage,
} from "@nestjs-adk/core";
import type {
	ChatCompletionContentPart,
	ChatCompletionFunctionTool,
	ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { InvalidJsonSchemaError } from "./errors/invalid-json-schema.error";
import { OpenAiChatRequest } from "./openai-chat-request";
import type { OpenAiOptions } from "./openai-options";

/**
 * Turns a neutral request into a Chat Completions body.
 *
 * Chat Completions and not Responses: every OpenAI compatible gateway implements the
 * former, and this adapter exists to reach them as much as to reach OpenAI itself.
 *
 * The causal pair survives the mapping. A tool call becomes an assistant turn carrying
 * `tool_calls`, its result becomes a `tool` turn carrying the same `tool_call_id`, and
 * the model reads back exactly the exchange the journal recorded.
 */
export class OpenAiRequestMapper {
	public toChatRequest(model: string, request: ModelRequest, options: OpenAiOptions = {}): OpenAiChatRequest {
		return new OpenAiChatRequest(
			model,
			this.messagesOf(request),
			request.tools.map((tool) => this.toolOf(tool.name, tool.description, tool.parameters)),
			{ ...this.parametersOf(options), ...this.responseFormatOf(request) },
		);
	}

	/** Structured output travels as a json schema response format, which is what makes the provider enforce it. */
	private responseFormatOf(request: ModelRequest): Record<string, unknown> {
		const schema = request.outputSchema;
		if (schema === undefined) return {};
		if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
			throw new InvalidJsonSchemaError("the requested output", this.typeNameOf(schema));
		}
		return { response_format: { type: "json_schema", json_schema: { name: "response", schema, strict: true } } };
	}

	private messagesOf(request: ModelRequest): ChatCompletionMessageParam[] {
		const messages: ChatCompletionMessageParam[] = [];
		const instructions = request.instructions;
		if (instructions !== undefined && !instructions.isEmpty) {
			messages.push({ role: "system", content: instructions.text });
		}
		for (const message of request.messages) messages.push(this.messageOf(message));
		return messages;
	}

	private messageOf(message: ModelMessage): ChatCompletionMessageParam {
		if (message instanceof AssistantMessage) return { role: "assistant", content: message.text };
		if (message instanceof ToolCallMessage) {
			return {
				role: "assistant",
				tool_calls: [
					{
						id: message.callId.value,
						type: "function",
						function: { name: message.toolName, arguments: JSON.stringify(message.args) },
					},
				],
			};
		}
		if (message instanceof ToolResultMessage) {
			return { role: "tool", tool_call_id: message.callId.value, content: JSON.stringify(message.output) };
		}
		if (message instanceof UserMessage) return { role: "user", content: this.userContentOf(message) };
		return { role: "user", content: message.text };
	}

	/**
	 * A message with an image stops being a string and becomes parts.
	 * The image travels as the data URL it already is, which is the only inline shape the
	 * chat completions format accepts, and the words follow it.
	 */
	private userContentOf(message: UserMessage): string | ChatCompletionContentPart[] {
		if (!message.hasMedia) return message.text;
		const media: ChatCompletionContentPart[] = message.media.map((part) => ({
			type: "image_url",
			image_url: { url: part.toDataUrl() },
		}));
		return [...media, { type: "text", text: message.text }];
	}

	/** A tool schema arrives as `unknown` and is checked here, never sent on trust. */
	private toolOf(name: string, description: string, parameters: unknown): ChatCompletionFunctionTool {
		if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
			throw new InvalidJsonSchemaError(name, this.typeNameOf(parameters));
		}
		const schema: Record<string, unknown> = {};
		for (const key of Object.keys(parameters)) schema[key] = Reflect.get(parameters, key);
		return { type: "function", function: { name, description, parameters: schema } };
	}

	private typeNameOf(value: unknown): string {
		if (value === null) return "null";
		return Array.isArray(value) ? "array" : typeof value;
	}

	/** Typed options win over the passthrough body, so a stray key cannot silently override them. */
	private parametersOf(options: OpenAiOptions): Record<string, unknown> {
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
