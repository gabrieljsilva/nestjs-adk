import { AdkError } from "../../../common/errors/adk.error";

/**
 * The journal disagrees with itself.
 * Two facts sharing an id with different content, or a revision that skips a step,
 * mean the history can no longer be trusted, so execution stops instead of guessing.
 */
export class JournalCorruptedError extends AdkError {
	public readonly code = "SESSION_JOURNAL_CORRUPTED";

	public constructor(
		public readonly sessionId: string,
		public readonly reason: string,
	) {
		super(`Journal of session ${sessionId} is corrupted: ${reason}`);
	}
}
