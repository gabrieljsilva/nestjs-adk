import type { Allowlist } from "./allowlist";
import type { AllowlistBudget } from "./allowlist-budget";

/** The documented exceptions plus the recorded size that keeps them from growing. */
export class GuardBaseline {
	public constructor(
		public readonly allowlist: Allowlist,
		public readonly budget: AllowlistBudget,
	) {}
}
