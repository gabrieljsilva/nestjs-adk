import { AdkError } from "../../../common/errors/adk.error";

/** A metadata key that names nothing cannot be found again, so it is refused where it is written. */
export class InvalidMetadataKeyError extends AdkError {
	public readonly code = "INVALID_METADATA_KEY";

	public constructor(public readonly received: string) {
		super(`A metadata key requires non-empty text, received ${JSON.stringify(received)}.`);
	}
}
