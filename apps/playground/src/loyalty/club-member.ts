/** The three tiers the Nébula Club has, in the order they were launched. */
export type ClubTier = "silver" | "gold" | "legend";

/**
 * Somebody who joined the Nébula Club, as the club knows them.
 *
 * The name is optional because signing up only asks for an email: a member who never filled
 * their profile in is an ordinary row here, and a prompt that needs the name is what has to
 * decide about it.
 */
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

	/** What the tier is worth, which is the one club rule the concierge states itself. */
	public get pointsPerReal(): number {
		if (this.tier === "legend") return 4;
		return this.tier === "gold" ? 2 : 1;
	}
}
