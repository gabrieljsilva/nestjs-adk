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
import { signsFunctionCalls } from "./gemini-generation";
import type { GeminiOptions } from "./gemini-options";
import { GeminiRequest } from "./gemini-request";

/**
 * What Google documents for a function call it did not write, and the only way to send one.
 *
 * It is a wire value and nothing else: it never reaches the journal, a domain message or
 * another provider, because a stored signature that is really a placeholder would be
 * indistinguishable from one the provider actually gave.
 */
const UNSIGNED = "skip_thought_signature_validator";

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
		const contents = this.signedOf(model, this.contentsOf(request));
		return new GeminiRequest(model, contents, this.configOf(request, options));
	}

	/**
	 * A call written by another provider reaches Gemini 3 with the placeholder Google documents.
	 *
	 * A conversation does not always stay on one model. It changes hands on a transfer to an
	 * agent that runs somewhere else, and it changes underneath itself when a failover reroutes
	 * a turn to the next model in the chain. Either way the history handed over holds calls
	 * nobody signed, and Gemini 3 answers 400 naming a tool, which reads like a broken schema
	 * and is really a provider boundary.
	 *
	 * So the request says what is true: this call did not come from here. Google discourages
	 * synthesised calls and warns the model reasons worse without the real signature, which is
	 * the trade being made. It is worth making for a handover the application never asked
	 * about, and it is never made for calls Gemini itself signed.
	 */
	private signedOf(model: string, contents: Content[]): Content[] {
		if (!signsFunctionCalls(model)) return contents;
		const opened = this.currentTurnAt(contents);
		return contents.map((content, at) => (at > opened ? this.signedTurn(content) : content));
	}

	/**
	 * Where the turn being answered starts, which is the only stretch Gemini validates.
	 *
	 * It walks the history newest to oldest for the last user turn carrying ordinary content,
	 * and everything after that is the current turn. A turn made only of function responses
	 * does not open one: it is an answer to a call inside the turn. When nothing qualifies the
	 * whole history is the current turn, which is the reading that errs toward sending a
	 * placeholder rather than toward a 400.
	 */
	private currentTurnAt(contents: Content[]): number {
		for (let at = contents.length - 1; at >= 0; at -= 1) {
			const content = contents[at];
			if (content?.role === "user" && !this.carries(content, "functionResponse")) return at;
		}
		return -1;
	}

	/** Only the call that opens a step is validated, so a parallel call after it is left alone. */
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

	/**
	 * The journal keeps one message per call; Gemini wants one turn per answer.
	 *
	 * Gemini 3 signs an answer on its first function call part only, and then refuses any
	 * later turn whose calls are not signed. Calls the model asked for in one answer have to
	 * go back as parts of one model turn, or the unsigned ones arrive alone and the request
	 * is a 400 naming the tool.
	 *
	 * The context arrives paired, call then result then call then result, because a call and
	 * its answer are one unit for everything upstream of here. So an unsigned call is put
	 * back where it came from: it can only be a continuation of the last signed answer,
	 * since a turn that opens an answer always carries a signature. Its result joins the
	 * results already grouped, which is the shape the provider documents for parallel calls.
	 */
	private contentsOf(request: ModelRequest): Content[] {
		const contents: Content[] = [];
		let lastAnswer: number | undefined;
		for (const message of request.messages) {
			const at = this.foldInto(contents, message, lastAnswer);
			if (at === undefined) {
				contents.push(this.contentOf(message));
				lastAnswer = message instanceof ToolCallMessage ? contents.length - 1 : lastAnswer;
			}
		}
		return contents;
	}

	/** Where the message was folded, or nothing when it opens a turn of its own. */
	private foldInto(contents: Content[], message: ModelMessage, lastAnswer?: number): number | undefined {
		if (message instanceof ToolCallMessage) return this.foldCall(contents, message, lastAnswer);
		if (message instanceof ToolResultMessage) return this.foldResult(contents, message);
		return undefined;
	}

	private foldCall(contents: Content[], message: ToolCallMessage, lastAnswer?: number): number | undefined {
		const answer = lastAnswer === undefined ? undefined : contents[lastAnswer];
		if (message.signature !== undefined || answer === undefined || !this.isSignedAnswer(answer)) return undefined;
		contents[lastAnswer ?? 0] = { role: "model", parts: [...(answer.parts ?? []), this.callPartOf(message)] };
		return lastAnswer;
	}

	private foldResult(contents: Content[], message: ToolResultMessage): number | undefined {
		const at = contents.length - 1;
		const previous = contents[at];
		if (previous === undefined || !this.carries(previous, "functionResponse")) return undefined;
		contents[at] = { role: "user", parts: [...(previous.parts ?? []), this.resultPartOf(message)] };
		return at;
	}

	/** Only an answer the provider signed can adopt a call that carries no signature. */
	private isSignedAnswer(content: Content): boolean {
		const first = content.parts?.[0];
		return this.carries(content, "functionCall") && Reflect.get(Object(first), "thoughtSignature") !== undefined;
	}

	/** A turn is foldable when everything already in it is the same kind of part. */
	private carries(content: Content, field: "functionCall" | "functionResponse"): boolean {
		const parts = content.parts ?? [];
		return parts.length > 0 && parts.every((part) => Reflect.get(part, field) !== undefined);
	}

	private contentOf(message: ModelMessage): Content {
		if (message instanceof AssistantMessage) return { role: "model", parts: [{ text: message.text }] };
		if (message instanceof ToolCallMessage) return { role: "model", parts: [this.callPartOf(message)] };
		if (message instanceof ToolResultMessage) return { role: "user", parts: [this.resultPartOf(message)] };
		if (message instanceof UserMessage) return { role: "user", parts: this.userPartsOf(message) };
		return { role: "user", parts: this.textPartsOf(message.text) };
	}

	private callPartOf(message: ToolCallMessage): Part {
		// The signature rides next to the call, not inside it, which is where Gemini put it.
		const call = { functionCall: { id: message.callId.value, name: message.toolName, args: message.args } };
		return message.signature === undefined ? call : { ...call, thoughtSignature: message.signature };
	}

	private resultPartOf(message: ToolResultMessage): Part {
		return { functionResponse: { id: message.callId.value, name: message.toolName, response: message.output } };
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
