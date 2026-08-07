import { Injectable } from "@nestjs/common";
import { ClubMember } from "./club-member";

/**
 * The club roster, keyed by whoever owns the session.
 *
 * It is in memory rather than in SQLite on purpose: the club is here to show a prompt built
 * from injected data, and a table would only add a schema to read the same three rows from.
 * Everything a real one would answer is the same shape.
 */
@Injectable()
export class MemberRepository {
	private readonly members = new Map<string, ClubMember>([
		["ana@nebula.games", ClubMember.of("ana@nebula.games", "gold", "Ana")],
		["bruno@nebula.games", ClubMember.of("bruno@nebula.games", "legend", "Bruno")],
		// Signed up with an email and never filled the profile in, which the prompt has to survive.
		["quiet@nebula.games", ClubMember.of("quiet@nebula.games", "silver")],
	]);

	public findByOwner(owner: string): ClubMember | undefined {
		return this.members.get(owner);
	}
}
