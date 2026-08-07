import { AdkError } from "@nestjs-adk/core";

/**
 * Nobody in the club owns this session.
 *
 * The club concierge is written around knowing who it is talking to, so this ends the run
 * rather than letting it answer as if the customer were a stranger. A conversation with
 * somebody who is not a member belongs to the guest desk.
 */
export class MemberNotFoundError extends AdkError {
	public readonly code = "PLAYGROUND_MEMBER_NOT_FOUND";

	public constructor(public readonly owner: string) {
		super(`No Nébula Club member owns the session of ${owner}.`);
	}
}
