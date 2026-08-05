/** An allowlist entry that would weaken the guard instead of documenting one exception. */
export class InvalidAllowlistEntryError extends Error {
	public readonly code = "GUARD_INVALID_ALLOWLIST_ENTRY";

	public constructor(
		public readonly entry: string,
		public readonly reason: string,
	) {
		super(`Invalid allowlist entry ${entry}: ${reason}`);
		this.name = new.target.name;
	}
}
