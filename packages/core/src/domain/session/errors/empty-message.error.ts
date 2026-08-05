import { AdkError } from "../../../common/errors/adk.error";

/** A run needs something to answer. */
export class EmptyMessageError extends AdkError {
	public readonly code = "SESSION_EMPTY_MESSAGE";

	public constructor() {
		super("Ask requires a message with at least one character.");
	}
}
