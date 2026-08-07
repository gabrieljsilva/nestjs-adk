import { Injectable } from "@nestjs/common";
import type { ClubMember } from "./club-member";
import { MemberNotFoundError } from "./errors/member-not-found.error";
import { MemberRepository } from "./member.repository";

/** Who the club is talking to, for a prompt that is written around knowing. */
@Injectable()
export class FindMemberUseCase {
	public constructor(private readonly members: MemberRepository) {}

	public execute(owner: string): ClubMember {
		const member = this.members.findByOwner(owner);
		if (member === undefined) throw new MemberNotFoundError(owner);
		return member;
	}
}
