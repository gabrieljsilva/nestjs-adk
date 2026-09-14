import { AdkError } from "../../../common/errors/adk.error";

/**
 * One metadata value outgrew what a session is meant to carry.
 *
 * Metadata rides on every commit, every snapshot and every rehydration, so a value the size
 * of a document turns a decision input into a payload. Whatever is that large belongs in
 * artifact storage, named here by its id.
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
