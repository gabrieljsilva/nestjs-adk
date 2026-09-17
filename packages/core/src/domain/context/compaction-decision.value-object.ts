/**
 * What a policy decided about one context: whether to compact, and the share of the
 * current prompt to keep rather than a number of tokens.
 */
export class CompactionDecision {
	private constructor(
		public readonly shouldCompact: boolean,
		public readonly targetShare: number,
		public readonly keepRecentBlocks: number,
	) {}

	public static skip(): CompactionDecision {
		return new CompactionDecision(false, 1, 0);
	}

	public static keepShare(targetShare: number, keepRecentBlocks: number): CompactionDecision {
		const share = Math.min(1, Math.max(0, targetShare));
		return new CompactionDecision(true, share, Math.max(0, Math.trunc(keepRecentBlocks)));
	}

	public calculateTarget(characters: number): number {
		return Math.floor(Math.max(0, characters) * this.targetShare);
	}
}
