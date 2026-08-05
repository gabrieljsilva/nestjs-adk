import { AdkError } from "../../../common/errors/adk.error";

/**
 * Someone else advanced the journal first.
 * The append wrote nothing: optimistic concurrency means the loser retries against
 * the revision it now knows about, never against the one it assumed.
 */
export class SessionRevisionConflictError extends AdkError {
	public readonly code = "SESSION_REVISION_CONFLICT";

	public constructor(
		public readonly sessionId: string,
		public readonly expected: number,
		public readonly actual: number,
	) {
		super(`Session ${sessionId} is at revision ${actual}, and the append expected ${expected}.`);
	}
}
