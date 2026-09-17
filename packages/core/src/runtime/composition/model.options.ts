import type { ModelResolver } from "../../contracts/model/model-resolver.contract";
import { BackoffRetryPolicy } from "../../domain/agent/backoff-retry.policy";
import type { ModelRetryPolicy } from "../../domain/agent/model-retry.policy";

/** The fields a caller may name; one left out keeps whatever the options already hold. */
export interface ModelOptionsPatch {
	/** Which model answers for an agent. Absent means the one the agent declared. */
	resolver?: ModelResolver;
	/** What a failed call does before failover is consulted, for an agent that declared none. */
	retry?: ModelRetryPolicy;
}

/**
 * Which model answers, and how hard the runtime tries that same model before it gives up
 * on it.
 *
 * Retry sits here rather than beside the tool policies because it is about the provider
 * call and nothing else, and it is a module default rather than a fixed behaviour because
 * what a sensible number of attempts is depends on who is paying for them. An agent
 * overrides it in `@Agent({ retry })`; failover stays the agent's alone, since the list of
 * models a chain may reach is not something a module can guess.
 */
export class ModelOptions {
	public constructor(
		public readonly resolver?: ModelResolver,
		/** Two retries with exponential backoff, honouring a `Retry-After` the provider sent. */
		public readonly retry: ModelRetryPolicy = new BackoffRetryPolicy(),
	) {}

	/** Options built from names instead of positions, with the same defaults as declaring none. */
	public static from(patch: ModelOptionsPatch): ModelOptions {
		return new ModelOptions().with(patch);
	}

	/** A copy with the named fields replaced and every other field kept. */
	public with(patch: ModelOptionsPatch): ModelOptions {
		return new ModelOptions(patch.resolver ?? this.resolver, patch.retry ?? this.retry);
	}
}
