import { AdkError } from "../../../common/errors/adk.error";

/** The session exists but no longer takes commands, so the run was refused before it started. */
export class SessionClosedError extends AdkError {
	public readonly code = "SESSION_CLOSED";

	public constructor(
		public readonly sessionId: string,
		public readonly status: string,
	) {
		super(`Session ${sessionId} is ${status} and does not accept commands.`);
	}
}
