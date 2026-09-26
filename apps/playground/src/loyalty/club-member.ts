export type ClubTier = "silver" | "gold" | "legend";

export class ClubMember {
	private constructor(
		public readonly owner: string,
		public readonly tier: ClubTier,
		public readonly name?: string,
	) {}

	public static of(owner: string, tier: ClubTier, name?: string): ClubMember {
		const trimmed = name?.trim();
		return new ClubMember(owner, tier, trimmed === undefined || trimmed.length === 0 ? undefined : trimmed);
	}

	public get isNamed(): boolean {
		return this.name !== undefined;
	}

	public get pointsPerReal(): number {
		if (this.tier === "legend") return 4;
		return this.tier === "gold" ? 2 : 1;
	}
}
