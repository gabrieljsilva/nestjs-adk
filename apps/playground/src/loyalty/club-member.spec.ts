import { describe, expect, it } from "vitest";
import { ClubMember } from "./club-member";

describe("ClubMember", () => {
	it("keeps who they are and which tier they joined at", () => {
		const member = ClubMember.of("ana@nebula.games", "gold", "Ana");

		expect(member.owner).toBe("ana@nebula.games");
		expect(member.tier).toBe("gold");
		expect(member.name).toBe("Ana");
		expect(member.isNamed).toBe(true);
	});

	/** Signing up only asks for an email, so a member with no name is an ordinary row. */
	it("has no name when the profile was never filled in", () => {
		const member = ClubMember.of("quiet@nebula.games", "silver");

		expect(member.name).toBeUndefined();
		expect(member.isNamed).toBe(false);
	});

	it("treats a blank name as no name at all", () => {
		expect(ClubMember.of("quiet@nebula.games", "silver", "   ").isNamed).toBe(false);
	});

	it("trims a name somebody typed with a space at the end", () => {
		expect(ClubMember.of("ana@nebula.games", "gold", " Ana ").name).toBe("Ana");
	});

	it("earns by tier, which is the one rule the concierge states itself", () => {
		expect(ClubMember.of("a", "silver").pointsPerReal).toBe(1);
		expect(ClubMember.of("b", "gold").pointsPerReal).toBe(2);
		expect(ClubMember.of("c", "legend").pointsPerReal).toBe(4);
	});
});
