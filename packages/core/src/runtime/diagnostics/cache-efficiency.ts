import { CacheReport } from "../../domain/diagnostics/cache-report";
import type { ModelUsage } from "../../domain/model/model-usage";
import { NotEnoughRunsError } from "./errors/not-enough-runs.error";

/** The first run pays for the prefix; measuring it would report zero and blame the agent. */
const WARM_UP = 1;

/**
 * Reads a sequence of runs and says how much of the prompt a provider served from cache.
 *
 * It needs at least two runs because implicit caching only exists once somebody has paid
 * for the prefix, so asking about a single run has no answer rather than an answer of zero.
 */
export class CacheEfficiency {
	public of(usages: readonly ModelUsage[]): CacheReport {
		if (usages.length <= WARM_UP) throw new NotEnoughRunsError(usages.length, WARM_UP + 1);

		const sampled = usages.slice(WARM_UP);
		const reported = sampled.filter((usage) => usage.reportsCaching);
		if (reported.length === 0) return CacheReport.unavailable(sampled.length);

		return new CacheReport(
			reported.reduce((total, usage) => total + usage.cachedInputTokens, 0),
			reported.reduce((total, usage) => total + usage.inputTokens, 0),
			reported.length,
			sampled.length - reported.length,
		);
	}
}
