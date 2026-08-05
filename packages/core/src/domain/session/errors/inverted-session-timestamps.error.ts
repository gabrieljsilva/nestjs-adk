import { AdkError } from "../../../common/errors/adk.error";

/** A restored session whose update predates its creation carries corrupted head data. */
export class InvertedSessionTimestampsError extends AdkError {
	public readonly code = "SESSION_INVERTED_TIMESTAMPS";

	public constructor(
		public readonly createdAt: string,
		public readonly updatedAt: string,
	) {
		super(`Session was updated at ${updatedAt}, which is before it was created at ${createdAt}.`);
	}
}
