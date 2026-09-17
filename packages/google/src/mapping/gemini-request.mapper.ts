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
import { InvalidJsonSchemaError } from "../errors/invalid-json-schema.error";
import { signsFunctionCalls } from "../model/gemini-generation.service";
import type { GeminiOptions } from "../model/gemini.options";
import { GeminiRequest } from "./gemini-request.value-object";

const UNSIGNED = "skip_thought_signature_validator";

export class GeminiRequestMapper {
	public toRequest(model: string, request: ModelRequest, options: GeminiOptions = {}): GeminiRequest {
		const contents = this.signContents(model, this.buildContents(request));
		return new GeminiRequest(model, contents, this.buildConfig(request, options));
	}

	private signContents(model: string, contents: Content[]): Content[] {
		if (!signsFunctionCalls(model)) return contents;
		const opened = this.currentTurnAt(contents);
		return contents.map((content, at) => (at > opened ? this.signedTurn(content) : content));
	}

	private currentTurnAt(contents: Content[]): number {
		for (let at = contents.length - 1; at >= 0; at -= 1) {
			const content = contents[at];
			if (content?.role === "user" && !this.carries(content, "functionResponse")) return at;
		}
		return -1;
	}

	private signedTurn(content: Content): Content {
		const parts = content.parts ?? [];
		const opens = parts.findIndex((part) => Reflect.get(part, "functionCall") !== undefined);
		const first = parts[opens];
		if (content.role !== "model" || first === undefined || Reflect.get(first, "thoughtSignature") !== undefined) {
			return content;
		}
		return {
			...content,
			parts: parts.map((part, at) => (at === opens ? { ...part, thoughtSignature: UNSIGNED } : part)),
		};
	}

	private buildContents(request: ModelRequest): Content[] {
		const contents: Content[] = [];
		let lastAnswer: number | undefined;
		for (const message of request.messages) {
			const at = this.foldInto(contents, message, lastAnswer);
			if (at === undefined) {
				contents.push(this.buildContent(message));
				lastAnswer = message instanceof ToolCallMessage ? contents.length - 1 : lastAnswer;
			}
		}
		return contents;
	}

	private foldInto(contents: Content[], message: ModelMessage, lastAnswer?: number): number | undefined {
		if (message instanceof ToolCallMessage) return this.foldCall(contents, message, lastAnswer);
		if (message instanceof ToolResultMessage) return this.foldResult(contents, message);
		return undefined;
	}

	private foldCall(contents: Content[], message: ToolCallMessage, lastAnswer?: number): number | undefined {
		const answer = lastAnswer === undefined ? undefined : contents[lastAnswer];
		if (message.signature !== undefined || answer === undefined || !this.isSignedAnswer(answer)) return undefined;
		contents[lastAnswer ?? 0] = { role: "model", parts: [...(answer.parts ?? []), this.buildCallPart(message)] };
		return lastAnswer;
	}

	private foldResult(contents: Content[], message: ToolResultMessage): number | undefined {
		const at = contents.length - 1;
		const previous = contents[at];
		if (previous === undefined || !this.carries(previous, "functionResponse")) return undefined;
		contents[at] = { role: "user", parts: [...(previous.parts ?? []), this.buildResultPart(message)] };
		return at;
	}

	private isSignedAnswer(content: Content): boolean {
		const first = content.parts?.[0];
		return this.carries(content, "functionCall") && Reflect.get(Object(first), "thoughtSignature") !== undefined;
	}

	private carries(content: Content, field: "functionCall" | "functionResponse"): boolean {
		const parts = content.parts ?? [];
		return parts.length > 0 && parts.every((part) => Reflect.get(part, field) !== undefined);
	}

	private buildContent(message: ModelMessage): Content {
		if (message instanceof AssistantMessage) return { role: "model", parts: [{ text: message.text }] };
		if (message instanceof ToolCallMessage) return { role: "model", parts: [this.buildCallPart(message)] };
		if (message instanceof ToolResultMessage) return { role: "user", parts: [this.buildResultPart(message)] };
		if (message instanceof UserMessage) return { role: "user", parts: this.buildUserParts(message) };
		return { role: "user", parts: this.buildTextParts(message.text) };
	}

	private buildCallPart(message: ToolCallMessage): Part {
		const call = { functionCall: { id: message.callId.value, name: message.toolName, args: message.args } };
		return message.signature === undefined ? call : { ...call, thoughtSignature: message.signature };
	}

	private buildResultPart(message: ToolResultMessage): Part {
		return { functionResponse: { id: message.callId.value, name: message.toolName, response: message.output } };
	}

	private buildUserParts(message: UserMessage): Part[] {
		if (!message.hasMedia) return this.buildTextParts(message.text);
		return [...message.media.map((part) => this.buildMediaPart(part)), { text: message.text }];
	}

	private buildMediaPart(part: MediaPart): Part {
		const url = part.url;
		if (url !== undefined) return { fileData: { fileUri: url, mimeType: part.mediaType } };
		return { inlineData: { mimeType: part.mediaType, data: part.base64 } };
	}

	private buildTextParts(text: string): Part[] {
		return [{ text }];
	}

	private buildConfig(request: ModelRequest, options: GeminiOptions): GenerateContentConfig {
		const config: GenerateContentConfig = { ...options.config };
		const instructions = request.instructions;
		if (instructions !== undefined && !instructions.isEmpty) config.systemInstruction = instructions.text;
		if (request.tools.length > 0) {
			config.tools = [
				{
					functionDeclarations: request.tools.map((tool) =>
						this.buildDeclaration(tool.name, tool.description, tool.parameters),
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

	private buildDeclaration(name: string, description: string, parameters: unknown): FunctionDeclaration {
		if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
			throw new InvalidJsonSchemaError(name, this.readTypeName(parameters));
		}
		const schema: Record<string, unknown> = {};
		for (const key of Object.keys(parameters)) schema[key] = Reflect.get(parameters, key);
		return { name, description, parametersJsonSchema: schema };
	}

	private readTypeName(value: unknown): string {
		if (value === null) return "null";
		return Array.isArray(value) ? "array" : typeof value;
	}
}
