import { AdkError } from "../../../common/errors/adk.error";

/**
 * A consumer took longer than it was given and was let go.
 *
 * It never reaches the caller: the publisher catches it and turns it into a notice,
 * because a slow observer is not a failed run. It exists as a type so that a hang is
 * told apart from a refusal by what was thrown rather than by reading a message.
 */
export class ConsumerTimeoutError extends AdkError {
	public readonly code = "EVENT_CONSUMER_TIMEOUT";

	public constructor(
		public readonly consumer: string,
		public readonly timeoutMs: number,
	) {
		super(`Consumer ${consumer} took longer than ${timeoutMs} ms.`);
	}
}
