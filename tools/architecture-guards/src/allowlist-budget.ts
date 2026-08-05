import type { Allowlist } from "./allowlist";
import { AllowlistBudgetMismatchError } from "./errors/allowlist-budget-mismatch.error";

/**
 * The recorded size of the allowlist, rule by rule.
 * It has to match exactly: growing means a new exception slipped in, shrinking means a
 * cleanup that nobody locked in. Either way the number in the file is updated on purpose.
 */
export class AllowlistBudget {
	private constructor(private readonly recorded: ReadonlyMap<string, number>) {}

	public static of(recorded: Readonly<Record<string, number>>): AllowlistBudget {
		return new AllowlistBudget(new Map(Object.entries(recorded)));
	}

	public assertMatches(allowlist: Allowlist): void {
		const actual = allowlist.countByRule();
		for (const [rule, recorded] of this.recorded) {
			const found = actual.get(rule) ?? 0;
			if (found !== recorded) throw new AllowlistBudgetMismatchError(rule, recorded, found);
		}
		for (const [rule, found] of actual) {
			if (this.recorded.has(rule)) continue;
			throw new AllowlistBudgetMismatchError(rule, 0, found);
		}
	}
}
