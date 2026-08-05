import { AdkError } from "../../../common/errors/adk.error";

/** Creating a session that already exists would overwrite a journal. */
export class SessionAlreadyExistsError extends AdkError {
	public readonly code = "SESSION_ALREADY_EXISTS";

	public constructor(public readonly sessionId: string) {
		super(`Session ${sessionId} already exists.`);
	}
}
