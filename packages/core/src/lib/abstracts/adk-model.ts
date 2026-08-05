import type { GenerateOptions, ModelRequest, ModelResponse } from "../types/model-io";

/**
 * Custom model contract: the AdkTool/AdkPrompt mirror for model implementations.
 * A regular provider: full constructor DI, referenced via @Agent({ model: MyModel })
 * or as a failover target. The active engine adapts it into its native loop
 * (tool calling, streaming and usage included; live connections are not supported).
 *
 * Instances are resolved ONCE at boot and shared across all runs/sessions: keep the
 * class a stateless singleton (REQUEST/TRANSIENT scopes are rejected at boot);
 * anything per-request belongs inside generate(), derived from the ModelRequest.
 */
export abstract class AdkModel {
	/** Discrimination is by this field (not instanceof), dual-package safe, like __adkModelSpec. */
	public readonly __adkModel = true as const;

	/** Model id: surfaces in logs and events. */
	public abstract readonly model: string;

	/** Resilience: where to go when this model fails before its first chunk. Same contract as the specs'. */
	public readonly failover?: import("../models/model-specs").FailoverOption;

	/** See ModelResponse for the chunk aggregation contract. */
	public abstract generate(request: ModelRequest, options?: GenerateOptions): AsyncIterable<ModelResponse>;
}

export function isAdkModel(value: unknown): value is AdkModel {
	return typeof value === "object" && value !== null && (value as { __adkModel?: unknown }).__adkModel === true;
}
