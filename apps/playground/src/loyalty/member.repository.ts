import { Injectable } from "@nestjs/common";
import { ClubMember } from "./club-member";

@Injectable()
export class MemberRepository {
	private readonly members = new Map<string, ClubMember>([
		["ana@nebula.games", ClubMember.of("ana@nebula.games", "gold", "Ana")],
		["bruno@nebula.games", ClubMember.of("bruno@nebula.games", "legend", "Bruno")],
		["quiet@nebula.games", ClubMember.of("quiet@nebula.games", "silver")],
	]);

	public findByOwner(owner: string): ClubMember | undefined {
		return this.members.get(owner);
	}
}
