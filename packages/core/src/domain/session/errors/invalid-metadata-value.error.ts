import { AdkError } from "../../../common/errors/adk.error";

/**
 * A metadata value that is not JSON was refused before it reached the journal.
 *
 * It is refused at the edge rather than at the codec because the two disagree usefully: a
 * `Date`, a `Map` or an instance of an application's own class serializes into something
 * that reads back as a different value, and by the time a codec noticed, the run that wrote
 * it would already have committed.
 */
export class InvalidMetadataValueError extends AdkError {
	public readonly code = "INVALID_METADATA_VALUE";

	public constructor(
		public readonly key: string,
		public readonly reason: string,
	) {
		super(`Metadata ${JSON.stringify(key)} is not a JSON value: ${reason}`);
	}
}
