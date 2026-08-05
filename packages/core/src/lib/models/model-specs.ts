import type { Type } from "@nestjs/common";
import { type AdkModel, isAdkModel } from "../abstracts/adk-model";
import type { GenerationParams } from "../types/model-io";

/**
 * Declarative model specs: value-object CLASSES, pure data, no SDK.
 * The active engine realizes each spec (e.g.: GoogleAdkEngine → native Gemini, OpenAI bridge).
 * Discrimination is by the __adkModelSpec field (not instanceof), dual-package safe.
 */

/** Anything a failover can land on: an id, a spec, a custom model instance or its DI class. */
export type FailoverTarget = string | Gemini | OpenAiLike | AdkModel | Type<AdkModel> | object;

export interface FailoverMeta {
	/** Id of the model that just failed. */
	currentModel: string;
	/** PREVIOUS failed attempts, oldest first. The current error is the function's first argument. */
	failures: Array<{ model: string; error: unknown }>;
}

/**
 * Failover policy: called when the current model fails BEFORE its first chunk. Return the target
 * to try next (the same model is a legitimate retry), or `undefined` to give up, which surfaces
 * as `ModelsExhaustedError`. A mid-stream failure or an abort never consults the policy: part of
 * the answer already reached the consumer, or nobody is waiting for one.
 *
 * The error arrives raw, as `unknown`: providers disagree on shapes, and a normalization would
 * lie. `httpStatusOf()` (from `@nestjs-adk/google`) reads the status from the SDK errors the
 * built-in specs produce, and returns `undefined` for shapes it does not know.
 */
export type FailoverFn = (
	error: unknown,
	meta: FailoverMeta,
) => FailoverTarget | undefined | Promise<FailoverTarget | undefined>;

/** The array form is sugar: any pre-stream failure advances to the next entry, in order. */
export type FailoverOption = FailoverTarget[] | FailoverFn;

/** Normalizes the option into the function form the executor drives. */
export function failoverPolicy(option: FailoverOption | undefined): FailoverFn | undefined {
	if (option === undefined) return undefined;
	if (typeof option === "function") return option;
	// meta.failures holds the attempts that already failed, so its length indexes the next entry:
	// primary failed with no prior failures → entry 0; entry 0 failed → entry 1; past the end → give up.
	return (_error, meta) => option[meta.failures.length];
}

/** Universal generation parameters: first-class typed; provider-specific extras go in `config`. */
export type GeminiGenerationOptions = GenerationParams;

export interface GeminiOptions extends GenerationParams {
	apiKey?: string;
	vertexai?: boolean;
	project?: string;
	location?: string;
	/** Billing/cost tracking: Vertex only (AI Studio ignores it). */
	labels?: Record<string, string>;
	/** Explicit Gemini cachedContent handle (created externally). */
	cache?: { content: string };
	/** Free passthrough for GenerateContentConfig (safetySettings, thinkingConfig, httpOptions...). Typed fields win. */
	config?: Record<string, unknown>;
	/** Resilience: where to go when THIS model fails before its first chunk. See FailoverFn. */
	failover?: FailoverOption;
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
	public readonly failover?: FailoverOption;

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
	/** Resilience: where to go when THIS model fails before its first chunk. See FailoverFn. */
	failover?: FailoverOption;
}

/** Any OpenAI-compatible API: most providers implement it. */
export class OpenAiLike<O extends OpenAiLikeOptions = OpenAiLikeOptions> implements OpenAiLikeOptions {
	public readonly __adkModelSpec = "openai-like" as const;
	public readonly baseUrl?: string;
	public readonly apiKeyEnv?: string;
	public readonly failover?: FailoverOption;

	public constructor(
		public readonly model: string,
		options: O = {} as O,
	) {
		Object.assign(this, options);
	}
}

export type ModelSpec = Gemini | OpenAiLike;

export function isModelSpec(model: unknown): model is ModelSpec {
	return typeof model === "object" && model !== null && "__adkModelSpec" in model;
}

/** Model id for logs, events and pricing: with failover, the primary's own id, until a reroute. */
export function modelIdOf(model: unknown): string | undefined {
	if (typeof model === "string") return model;
	if (isAdkModel(model)) return model.model;
	if (!isModelSpec(model)) return undefined;
	return model.model;
}
