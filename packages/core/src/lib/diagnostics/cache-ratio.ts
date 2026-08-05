import type { TokenUsage } from "../types/events";
import type { CacheReport } from "./context-types";

/**
 * Cache efficiency over a SEQUENCE of runs against a real provider.
 * The first run is dropped: implicit caching only exists after somebody paid for the prefix,
 * so measuring it would always report zero and blame the agent for how caching works.
 *
 * A run whose provider said nothing about cached tokens leaves the sample ENTIRELY, numerator and
 * denominator. Keeping its prompt tokens in the denominator would silently assume "zero cached",
 * which is the same false negative this report exists to avoid.
 */
export function cacheHitRatio(usages: TokenUsage[]): CacheReport {
	if (usages.length < 2) {
		throw new Error(`cacheHitRatio needs at least 2 runs (the first one warms the cache), received ${usages.length}.`);
	}

	const sampled = usages.slice(1);
	let cachedTokens = 0;
	let promptTokens = 0;
	let sampledRuns = 0;

	for (const usage of sampled) {
		// Reported, even at 0: that is a real "cache did not engage", unlike an absent field.
		if (usage.cachedTokens == null) continue;
		sampledRuns += 1;
		promptTokens += usage.promptTokens;
		cachedTokens += usage.cachedTokens;
	}

	return {
		available: sampledRuns > 0,
		ratio: promptTokens === 0 ? 0 : cachedTokens / promptTokens,
		cachedTokens,
		promptTokens,
		sampledRuns,
		silentRuns: sampled.length - sampledRuns,
	};
}
