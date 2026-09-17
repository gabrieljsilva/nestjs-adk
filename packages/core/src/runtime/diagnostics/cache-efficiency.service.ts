import { CacheReport } from "../../domain/diagnostics/cache-report.value-object";
import type { ModelUsage } from "../../domain/model/usage/model-usage.value-object";
import { NotEnoughRunsError } from "./errors/not-enough-runs.error";

const WARM_UP = 1;

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
