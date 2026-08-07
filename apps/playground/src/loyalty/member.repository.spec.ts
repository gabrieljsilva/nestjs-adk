import { describe, expect, it } from "vitest";
import { MemberRepository } from "./member.repository";

describe("MemberRepository", () => {
	it("finds a member by whoever owns the session", () => {
		expect(new MemberRepository().findByOwner("ana@nebula.games")?.name).toBe("Ana");
	});

	it("answers nothing for somebody who never joined", () => {
		expect(new MemberRepository().findByOwner("stranger@nebula.games")).toBeUndefined();
	});

	/** The row the prompt has to survive: a member whose profile has no name in it. */
	it("holds a member who signed up with an email and nothing else", () => {
		const member = new MemberRepository().findByOwner("quiet@nebula.games");

		expect(member?.tier).toBe("silver");
		expect(member?.isNamed).toBe(false);
	});
});
