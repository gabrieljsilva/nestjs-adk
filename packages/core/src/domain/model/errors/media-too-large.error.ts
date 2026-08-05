import { AdkError } from "../../../common/errors/adk.error";

/**
 * The attachment, or the set of them, is bigger than a request is allowed to carry.
 * The measure that failed is named because the three of them fail for different reasons:
 * one image too big, one image that decodes too big, or a set that only overflows together.
 */
export class MediaTooLargeError extends AdkError {
	public readonly code = "MEDIA_TOO_LARGE";

	public constructor(
		public readonly measure: string,
		public readonly bytes: number,
		public readonly limitBytes: number,
	) {
		super(`Attachment ${measure} size of ${bytes} bytes exceeds the limit of ${limitBytes} bytes.`);
	}
}
