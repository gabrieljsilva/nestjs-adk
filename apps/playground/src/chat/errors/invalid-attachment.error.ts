import { AdkError } from "@nestjs-adk/core";

/**
 * Something arrived in the request as an attachment and is not one.
 *
 * The request body is the outermost boundary of the store, so what it carries is unknown
 * until it is read. Failing here names the value and what was expected of it, instead of
 * letting `undefined` reach the runtime and fail as a media part nobody wrote.
 */
export class InvalidAttachmentError extends AdkError {
	public readonly code = "PLAYGROUND_INVALID_ATTACHMENT";

	public constructor(
		public readonly received: string,
		public readonly expected: string,
	) {
		super(`Attachment ${received} is not ${expected}.`);
	}
}
