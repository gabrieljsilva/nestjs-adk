import { AdkError } from "@nestjs-adk/core";

export class InvalidAttachmentError extends AdkError {
	public readonly code = "PLAYGROUND_INVALID_ATTACHMENT";

	public constructor(
		public readonly received: string,
		public readonly expected: string,
	) {
		super(`Attachment ${received} is not ${expected}.`);
	}
}
