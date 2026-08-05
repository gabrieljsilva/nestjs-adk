import { AdkError } from "../../../common/errors/adk.error";

/**
 * The attachment could not be written, so the run does not start.
 *
 * A tool result that fails to offload falls back to the context and loses nothing. An
 * attachment has no such fallback: the journal records the id and never the bytes, so a
 * message committed without them would be a question about an image that no longer
 * exists. Failing here keeps the session honest.
 */
export class AttachmentNotStoredError extends AdkError {
	public readonly code = "ATTACHMENT_NOT_STORED";

	public constructor(
		public readonly mediaType: string,
		public readonly cause?: unknown,
	) {
		super(`The ${mediaType} attachment could not be written to artifact storage, so the message was not accepted.`);
	}
}
