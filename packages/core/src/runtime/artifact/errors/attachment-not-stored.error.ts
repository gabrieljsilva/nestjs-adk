import { AdkError } from "../../../common/errors/adk.error";

export class AttachmentNotStoredError extends AdkError {
	public readonly code = "ATTACHMENT_NOT_STORED";

	public constructor(
		public readonly mediaType: string,
		public readonly cause?: unknown,
	) {
		super(`The ${mediaType} attachment could not be written to artifact storage, so the message was not accepted.`);
	}
}
