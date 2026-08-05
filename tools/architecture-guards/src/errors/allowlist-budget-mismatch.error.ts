/** The allowlist no longer matches its recorded budget, in either direction. */
export class AllowlistBudgetMismatchError extends Error {
	public readonly code = "GUARD_ALLOWLIST_BUDGET_MISMATCH";

	public constructor(
		public readonly rule: string,
		public readonly recorded: number,
		public readonly actual: number,
	) {
		super(
			actual > recorded
				? `Rule ${rule} grew from ${recorded} to ${actual} allowlisted files; fix the code instead of widening the allowlist.`
				: `Rule ${rule} dropped from ${recorded} to ${actual} allowlisted files; lower the recorded budget to lock the gain in.`,
		);
		this.name = new.target.name;
	}
}
