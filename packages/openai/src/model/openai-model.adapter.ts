import {
	ModelCapabilities,
	ModelCapability,
	type ModelChunk,
	ModelContextWindow,
	ModelDescriptor,
	ModelIdentity,
	type ModelRequest,
	ModelSpec,
	UnknownContextWindow,
} from "@nestjs-adk/core";
import { OpenAiRequestMapper } from "../mapping/openai-request.mapper";
import type { OpenAiTransport } from "../transport/openai-transport.contract";
import { SdkOpenAiTransport } from "../transport/sdk-openai-transport.adapter";
import type { OpenAiOptions } from "./openai.options";

const PROVIDER = "openai";

/**
 * OpenAI's Chat Completions as an `LlmModel`, and with it every provider that speaks the same
 * API: point `baseURL` at Groq, Together, OpenRouter, DeepSeek or Ollama and the rest is the
 * same. Construct it with a model name and options and hand it to the module.
 *
 * The context window is only known when `contextWindowTokens` is given. Provider errors arrive
 * as `ModelFailure`, while a schema that cannot be sent raises `InvalidJsonSchemaError` or
 * `NonStrictJsonSchemaError` before the request leaves.
 */
export class OpenAiModel extends ModelSpec {
	public readonly provider = PROVIDER;

	private readonly transport: OpenAiTransport;

	public constructor(
		public readonly model: string,
		public readonly options: OpenAiOptions = {},
		transport?: OpenAiTransport,
		private readonly requests: OpenAiRequestMapper = new OpenAiRequestMapper(),
	) {
		super();
		this.transport = transport ?? new SdkOpenAiTransport(options);
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(new ModelIdentity(PROVIDER, this.model), this.buildWindow(), this.buildCapabilities());
	}

	public generate(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		return this.transport.stream(this.requests.toChatRequest(this.model, request, this.options), signal);
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
		]);
	}
}
