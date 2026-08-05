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
} from "@nestjs-adk/core/native";
import type { OpenAiOptions } from "./openai-options";
import { OpenAiRequestMapper } from "./openai-request-mapper";
import type { OpenAiTransport } from "./openai-transport";
import { SdkOpenAiTransport } from "./sdk-openai-transport";

const PROVIDER = "openai";

/**
 * An OpenAI compatible model, declared by name and options.
 *
 * ```ts
 * const flagship = new OpenAiModel("gpt-5", { apiKey: process.env.OPENAI_API_KEY });
 * const local = new OpenAiModel("llama3", { baseURL: "http://localhost:11434/v1", apiKey: "ollama" });
 * ```
 *
 * The context window is not guessed. OpenAI publishes no endpoint for it and the
 * numbers change release by release, so a caller who knows states it through
 * `contextWindowTokens`, and a caller who does not gets a window that reports itself
 * unknown: composition is still measured and nothing is silently truncated.
 *
 * There is no `countTokens` here, and the omission is the point. The API bills tokens
 * but never counts them ahead of a call, so this adapter does not declare
 * `TOKEN_COUNTING` and the runtime never asks it for a number it would have to invent.
 * The real size arrives with the usage of the call, as it does for the provider itself.
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
		return new ModelDescriptor(ModelIdentity.of(PROVIDER, this.model), this.windowOf(), this.capabilitiesOf());
	}

	public generate(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		return this.transport.stream(this.requests.toChatRequest(this.model, request, this.options), signal);
	}

	private windowOf(): ModelContextWindow | UnknownContextWindow {
		const total = this.options.contextWindowTokens;
		if (total === undefined) return new UnknownContextWindow();
		return ModelContextWindow.of(total, this.options.reservedOutputTokens ?? this.options.maxOutputTokens ?? 0);
	}

	private capabilitiesOf(): ModelCapabilities {
		return ModelCapabilities.of([
			[ModelCapability.TOOLS, true],
			[ModelCapability.STREAMING, true],
			[ModelCapability.STRUCTURED_OUTPUT, true],
			[ModelCapability.MEDIA_INPUT, true],
		]);
	}
}
