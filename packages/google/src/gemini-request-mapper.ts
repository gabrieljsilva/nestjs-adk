import type { Content, FunctionDeclaration, GenerateContentConfig, Part } from "@google/genai";
import {
	AssistantMessage,
	type MediaPart,
	type ModelMessage,
	type ModelRequest,
	ToolCallMessage,
	ToolResultMessage,
	UserMessage,
} from "@nestjs-adk/core";
import { InvalidJsonSchemaError } from "./errors/invalid-json-schema.error";
import type { GeminiOptions } from "./gemini-options";
import { GeminiRequest } from "./gemini-request";

/**
 * Turns a neutral request into a Gemini generate call.
 *
 * Gemini has no system role: the prompt travels as `systemInstruction` in the config,
 * apart from the conversation, which is also what lets it be cached on its own.
 *
 * The causal pair survives the mapping. A tool call becomes a model turn carrying a
 * `functionCall`, its result becomes a user turn carrying a `functionResponse`, and
 * both keep the same id so the pair stays readable even when several calls are open.
 */
export class GeminiRequestMapper {
	public toRequest(model: string, request: ModelRequest, options: GeminiOptions = {}): GeminiRequest {
		return new GeminiRequest(model, this.contentsOf(request), this.configOf(request, options));
	}

	private contentsOf(request: ModelRequest): Content[] {
		return request.messages.map((message) => this.contentOf(message));
	}

	private contentOf(message: ModelMessage): Content {
		if (message instanceof AssistantMessage) return { role: "model", parts: [{ text: message.text }] };
		if (message instanceof ToolCallMessage) {
			// The signature rides next to the call, not inside it, which is where Gemini put it.
			const call = { functionCall: { id: message.callId.value, name: message.toolName, args: message.args } };
			return {
				role: "model",
				parts: [message.signature === undefined ? call : { ...call, thoughtSignature: message.signature }],
			};
		}
		if (message instanceof ToolResultMessage) {
			return {
				role: "user",
				parts: [{ functionResponse: { id: message.callId.value, name: message.toolName, response: message.output } }],
			};
		}
		if (message instanceof UserMessage) return { role: "user", parts: this.userPartsOf(message) };
		return { role: "user", parts: this.textPartsOf(message.text) };
	}

	/**
	 * The image comes first and the words after it.
	 * That is the order Google recommends for a prompt about a single image, and it is the
	 * order that reads as a question about the picture rather than a caption under it.
	 */
	private userPartsOf(message: UserMessage): Part[] {
		if (!message.hasMedia) return this.textPartsOf(message.text);
		return [...message.media.map((part) => this.mediaPartOf(part)), { text: message.text }];
	}

	/**
	 * Gemini keeps the two ways an image arrives in two different fields.
	 * Bytes go inline, and an address goes as file data, which is the same field the Files
	 * API and a Cloud Storage URI use: what varies is who fetches, not what is sent.
	 */
	private mediaPartOf(part: MediaPart): Part {
		const url = part.url;
		if (url !== undefined) return { fileData: { fileUri: url, mimeType: part.mediaType } };
		return { inlineData: { mimeType: part.mediaType, data: part.base64 } };
	}

	private textPartsOf(text: string): Part[] {
		return [{ text }];
	}

	private configOf(request: ModelRequest, options: GeminiOptions): GenerateContentConfig {
		const config: GenerateContentConfig = { ...options.config };
		const instructions = request.instructions;
		if (instructions !== undefined && !instructions.isEmpty) config.systemInstruction = instructions.text;
		if (request.tools.length > 0) {
			config.tools = [
				{
					functionDeclarations: request.tools.map((tool) =>
						this.declarationOf(tool.name, tool.description, tool.parameters),
					),
				},
			];
		}
		if (options.temperature !== undefined) config.temperature = options.temperature;
		if (options.topP !== undefined) config.topP = options.topP;
		if (options.topK !== undefined) config.topK = options.topK;
		if (options.maxOutputTokens !== undefined) config.maxOutputTokens = options.maxOutputTokens;
		if (options.stopSequences !== undefined) config.stopSequences = options.stopSequences;
		if (options.frequencyPenalty !== undefined) config.frequencyPenalty = options.frequencyPenalty;
		if (options.presencePenalty !== undefined) config.presencePenalty = options.presencePenalty;
		if (options.labels !== undefined) config.labels = options.labels;
		if (options.cachedContent !== undefined) config.cachedContent = options.cachedContent;
		if (request.outputSchema !== undefined) {
			config.responseMimeType = "application/json";
			config.responseJsonSchema = request.outputSchema;
		}
		return config;
	}

	/** A tool schema arrives as `unknown` and is checked here, never sent on trust. */
	private declarationOf(name: string, description: string, parameters: unknown): FunctionDeclaration {
		if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
			throw new InvalidJsonSchemaError(name, this.typeNameOf(parameters));
		}
		const schema: Record<string, unknown> = {};
		for (const key of Object.keys(parameters)) schema[key] = Reflect.get(parameters, key);
		return { name, description, parametersJsonSchema: schema };
	}

	private typeNameOf(value: unknown): string {
		if (value === null) return "null";
		return Array.isArray(value) ? "array" : typeof value;
	}
}
