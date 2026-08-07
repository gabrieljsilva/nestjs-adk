import { describe, expect, it } from "vitest";
import { MemberNotFoundError } from "./errors/member-not-found.error";
import { FindMemberUseCase } from "./find-member.use-case";
import { MemberRepository } from "./member.repository";

function useCase(): FindMemberUseCase {
	return new FindMemberUseCase(new MemberRepository());
}

describe("FindMemberUseCase", () => {
	it("answers the member who owns the session", () => {
		expect(useCase().execute("bruno@nebula.games").tier).toBe("legend");
	});

	/** The concierge is written around knowing, so not knowing ends the run instead. */
	it("fails for somebody the club does not know", () => {
		expect(() => useCase().execute("stranger@nebula.games")).toThrow(MemberNotFoundError);
	});

	it("fails for a session that carries no owner at all", () => {
		expect(() => useCase().execute("")).toThrow(MemberNotFoundError);
	});
});
