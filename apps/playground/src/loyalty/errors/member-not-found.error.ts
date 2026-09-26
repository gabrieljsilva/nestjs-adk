import { AdkError } from "@nestjs-adk/core";

export class MemberNotFoundError extends AdkError {
	public readonly code = "PLAYGROUND_MEMBER_NOT_FOUND";

	public constructor(public readonly owner: string) {
		super(`No Nébula Club member owns the session of ${owner}.`);
	}
}
