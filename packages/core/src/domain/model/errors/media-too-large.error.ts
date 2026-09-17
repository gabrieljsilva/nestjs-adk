import { AdkError } from "../../../common/errors/adk.error";

/**
 * The attachment, or the set of them, is over what a request may carry.
 * `measure` names which of the three ceilings failed: encoded, decoded or total.
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
