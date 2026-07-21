/**
 * Declarative model specs — value-object CLASSES, pure data, no SDK.
 * The active engine realizes each spec (e.g.: GoogleAdkEngine → native Gemini, OpenAI bridge, RoutedLlm).
 * Discrimination is by the __adkModelSpec field (not instanceof) — dual-package safe.
 */

export interface GeminiOptions {
	apiKey?: string;
	vertexai?: boolean;
	project?: string;
	location?: string;
	/** Billing/cost tracking — Vertex only (AI Studio ignores it). */
	labels?: Record<string, string>;
	/** Explicit Gemini cachedContent handle (created externally). */
	cache?: { content: string };
	/** Free passthrough for GenerateContentConfig (temperature, safetySettings, httpOptions...). */
	config?: Record<string, unknown>;
}

/** Gemini model spec. Canonical import: @nestjs-adk/google. */
export class Gemini implements GeminiOptions {
	public readonly __adkModelSpec = "gemini" as const;
	public readonly apiKey?: string;
	public readonly vertexai?: boolean;
	public readonly project?: string;
	public readonly location?: string;
	public readonly labels?: Record<string, string>;
	public readonly cache?: { content: string };
	public readonly config?: Record<string, unknown>;

	public constructor(
		public readonly model: string,
		options: GeminiOptions = {},
	) {
		Object.assign(this, options);
	}
}

export interface OpenAiLikeOptions {
	/** OpenAI-compatible endpoint (OpenAI, OpenRouter, Ollama, xAI...). Default: the official OpenAI API. */
	baseUrl?: string;
	/** Env var holding the API key. Default: OPENAI_API_KEY. */
	apiKeyEnv?: string;
}

/** Any OpenAI-compatible API — most providers implement it. */
export class OpenAiLike implements OpenAiLikeOptions {
	public readonly __adkModelSpec = "openai-like" as const;
	public readonly baseUrl?: string;
	public readonly apiKeyEnv?: string;

	public constructor(
		public readonly model: string,
		options: OpenAiLikeOptions = {},
	) {
		Object.assign(this, options);
	}
}

export type RouterTarget = string | Gemini | OpenAiLike | object;

/** Failover router: advances in declared order when the target fails before the 1st chunk. */
export class ModelRouter {
	public readonly __adkModelSpec = "router" as const;
	public readonly targets: Record<string, RouterTarget>;
	public readonly strategy: "failover";

	public constructor(options: { targets: Record<string, RouterTarget> | RouterTarget[]; strategy?: "failover" }) {
		this.targets = Array.isArray(options.targets)
			? Object.fromEntries(options.targets.map((target, index) => [`target_${index}`, target]))
			: options.targets;
		this.strategy = options.strategy ?? "failover";
	}
}

export type ModelSpec = Gemini | OpenAiLike | ModelRouter;

export function isModelSpec(model: unknown): model is ModelSpec {
	return typeof model === "object" && model !== null && "__adkModelSpec" in model;
}
