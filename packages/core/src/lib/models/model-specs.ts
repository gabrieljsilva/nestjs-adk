import type { Type } from "@nestjs/common";
import { type AdkModel, isAdkModel } from "../abstracts/adk-model";
import type { GenerationParams } from "../types/model-io";

/**
 * Declarative model specs — value-object CLASSES, pure data, no SDK.
 * The active engine realizes each spec (e.g.: GoogleAdkEngine → native Gemini, OpenAI bridge, RoutedLlm).
 * Discrimination is by the __adkModelSpec field (not instanceof) — dual-package safe.
 */

/** Universal generation parameters — first-class typed; provider-specific extras go in `config`. */
export type GeminiGenerationOptions = GenerationParams;

export interface GeminiOptions extends GenerationParams {
	apiKey?: string;
	vertexai?: boolean;
	project?: string;
	location?: string;
	/** Billing/cost tracking — Vertex only (AI Studio ignores it). */
	labels?: Record<string, string>;
	/** Explicit Gemini cachedContent handle (created externally). */
	cache?: { content: string };
	/** Free passthrough for GenerateContentConfig (safetySettings, thinkingConfig, httpOptions...). Typed fields win. */
	config?: Record<string, unknown>;
}

/** Gemini model spec. Canonical import: @nestjs-adk/google. */
export class Gemini<O extends GeminiOptions = GeminiOptions> implements GeminiOptions {
	public readonly __adkModelSpec = "gemini" as const;
	public readonly apiKey?: string;
	public readonly vertexai?: boolean;
	public readonly project?: string;
	public readonly location?: string;
	public readonly labels?: Record<string, string>;
	public readonly cache?: { content: string };
	public readonly config?: Record<string, unknown>;
	public readonly temperature?: number;
	public readonly topP?: number;
	public readonly topK?: number;
	public readonly maxOutputTokens?: number;
	public readonly frequencyPenalty?: number;
	public readonly presencePenalty?: number;
	public readonly stopSequences?: string[];

	public constructor(
		public readonly model: string,
		options: O = {} as O,
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
export class OpenAiLike<O extends OpenAiLikeOptions = OpenAiLikeOptions> implements OpenAiLikeOptions {
	public readonly __adkModelSpec = "openai-like" as const;
	public readonly baseUrl?: string;
	public readonly apiKeyEnv?: string;

	public constructor(
		public readonly model: string,
		options: O = {} as O,
	) {
		Object.assign(this, options);
	}
}

export type RouterTarget = string | Gemini | OpenAiLike | AdkModel | Type<AdkModel> | object;

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

/**
 * Model id for logs, events and pricing. A router reports its FIRST declared target — the one that
 * actually runs until a failover reroutes it, which the engine reports on its own.
 */
export function modelIdOf(model: unknown): string | undefined {
	if (typeof model === "string") return model;
	if (isAdkModel(model)) return model.model;
	if (!isModelSpec(model)) return undefined;
	if (model.__adkModelSpec === "router") return modelIdOf(Object.values(model.targets)[0]);
	return model.model;
}
