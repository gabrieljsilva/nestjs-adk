import { AdkError } from "../../../common/errors/adk.error";

/** No session with this id is stored. */
export class SessionNotFoundError extends AdkError {
	public readonly code = "SESSION_NOT_FOUND";

	public constructor(public readonly sessionId: string) {
		super(`Session ${sessionId} was not found.`);
	}
}
