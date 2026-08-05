import { AdkError } from "../../../common/errors/adk.error";

/** A durable session has to belong to someone, or it can never be found again. */
export class MissingSessionOwnerError extends AdkError {
	public readonly code = "SESSION_MISSING_OWNER";

	public constructor(public readonly sessionId: string) {
		super(`Durable session ${sessionId} requires an owner; an ephemeral session may go without one.`);
	}
}
