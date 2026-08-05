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
import type { GeminiOptions } from "./gemini-options";
import { GeminiRequestMapper } from "./gemini-request-mapper";
import type { GeminiTransport } from "./gemini-transport";
import { GenAiTransport } from "./genai-transport";

const PROVIDER = "google";

/**
 * A Gemini model, declared by name and options.
 *
 * ```ts
 * const flash = new GeminiModel("gemini-2.5-flash", { apiKey: process.env.GEMINI_API_KEY });
 * const vertex = new GeminiModel("gemini-2.5-pro", { vertexai: true, project: "acme", location: "us-central1" });
 * ```
 *
 * Both surfaces are the same model here: only the client differs, and the mapping,
 * the streaming and the token counting are shared.
 *
 * The context window is not guessed. Google publishes the numbers in documentation
 * rather than in the API, and they change model by model, so a caller who knows states
 * it through `contextWindowTokens` and a caller who does not gets a window that reports
 * itself unknown.
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
		return new ModelDescriptor(ModelIdentity.of(PROVIDER, this.model), this.windowOf(), this.capabilitiesOf());
	}

	public generate(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		return this.transport.stream(this.requests.toRequest(this.model, request, this.options), signal);
	}

	/** Measured, not estimated: Gemini is one of the few providers that counts before the call. */
	public countTokens(request: ModelRequest): Promise<TokenCount> {
		return this.transport.countTokens(this.requests.toRequest(this.model, request, this.options));
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
			[ModelCapability.PROMPT_CACHE, true],
			[ModelCapability.TOKEN_COUNTING, true],
		]);
	}
}
