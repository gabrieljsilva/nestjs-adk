import { AdkError } from "../../../common/errors/adk.error";

/**
 * One metadata value serializes past the per-key limit and was refused.
 * Metadata rides on every commit and rehydration; anything that large belongs in artifact storage.
 */
export class MetadataValueTooLargeError extends AdkError {
	public readonly code = "METADATA_VALUE_TOO_LARGE";

	public constructor(
		public readonly key: string,
		public readonly bytes: number,
		public readonly maxBytes: number,
	) {
		super(`Metadata ${JSON.stringify(key)} serializes to ${bytes} bytes, over the limit of ${maxBytes}.`);
	}
}
