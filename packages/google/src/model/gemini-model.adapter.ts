import {
	ModelCapabilities,
	ModelCapability,
	type ModelChunk,
	ModelContextWindow,
	ModelDescriptor,
	ModelIdentity,
	type ModelRequest,
	ModelSpec,
	type TokenCount,
	UnknownContextWindow,
} from "@nestjs-adk/core";
import { GeminiRequestMapper } from "../mapping/gemini-request.mapper";
import type { GeminiTransport } from "../transport/gemini-transport.contract";
import { GenAiTransport } from "../transport/genai-transport.adapter";
import type { GeminiOptions } from "./gemini.options";

const PROVIDER = "google";

/**
 * Google's Gemini as an `LlmModel`: construct it with a model name and options and hand it to
 * the module. Every answer is streamed, and tools, structured output, media and prompt caching
 * are all available.
 *
 * The context window is only known when `contextWindowTokens` is given, and without it nothing
 * that depends on the window size can be reported. Provider errors arrive as `ModelFailure`,
 * except a schema Gemini cannot take, which raises `InvalidJsonSchemaError`.
 */
export class GeminiModel extends ModelSpec {
	public readonly provider = PROVIDER;

	private readonly transport: GeminiTransport;

	public constructor(
		public readonly model: string,
		public readonly options: GeminiOptions = {},
		transport?: GeminiTransport,
		private readonly requests: GeminiRequestMapper = new GeminiRequestMapper(),
	) {
		super();
		this.transport = transport ?? new GenAiTransport(options);
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(new ModelIdentity(PROVIDER, this.model), this.buildWindow(), this.buildCapabilities());
	}

	public generate(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		return this.transport.stream(this.requests.toRequest(this.model, request, this.options), signal);
	}

	public countTokens(request: ModelRequest): Promise<TokenCount> {
		return this.transport.countTokens(this.requests.toRequest(this.model, request, this.options));
	}

	private buildWindow(): ModelContextWindow | UnknownContextWindow {
		const total = this.options.contextWindowTokens;
		if (total === undefined) return new UnknownContextWindow();
		return new ModelContextWindow(total, this.options.reservedOutputTokens ?? this.options.maxOutputTokens ?? 0);
	}

	private buildCapabilities(): ModelCapabilities {
		return ModelCapabilities.fromEntries([
			[ModelCapability.TOOLS, true],
			[ModelCapability.STREAMING, true],
			[ModelCapability.STRUCTURED_OUTPUT, true],
			[ModelCapability.MEDIA_INPUT, true],
			[ModelCapability.MEDIA_URL, true],
			[ModelCapability.PROMPT_CACHE, true],
			[ModelCapability.TOKEN_COUNTING, true],
		]);
	}
}
