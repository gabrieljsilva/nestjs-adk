import type { ModelResolver } from "../../contracts/model/model-resolver.contract";
import { BackoffRetryPolicy } from "../../domain/agent/backoff-retry.policy";
import type { ModelRetryPolicy } from "../../domain/agent/model-retry.policy";

/** The fields a caller may name; one left out keeps whatever the options already hold. */
export interface ModelOptionsPatch {
	resolver?: ModelResolver;
	retry?: ModelRetryPolicy;
}

/**
 * Which model answers for an agent, and how hard the runtime tries that same model before
 * it gives up on it. By default two retries with exponential backoff, honouring a
 * `Retry-After` the provider sent.
 *
 * An agent overrides the retry policy in `@Agent({ retry })`; failover stays the agent's.
 */
export class ModelOptions {
	public constructor(
		public readonly resolver?: ModelResolver,
		public readonly retry: ModelRetryPolicy = new BackoffRetryPolicy(),
	) {}

	public static from(patch: ModelOptionsPatch): ModelOptions {
		return new ModelOptions().with(patch);
	}

	public with(patch: ModelOptionsPatch): ModelOptions {
		return new ModelOptions(patch.resolver ?? this.resolver, patch.retry ?? this.retry);
	}
}
