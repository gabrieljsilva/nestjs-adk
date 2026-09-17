import { AdkError } from "../../../common/errors/adk.error";

/** A metadata value that is not JSON, refused where it is written rather than where it is read. */
export class InvalidMetadataValueError extends AdkError {
	public readonly code = "INVALID_METADATA_VALUE";

	public constructor(
		public readonly key: string,
		public readonly reason: string,
	) {
		super(`Metadata ${JSON.stringify(key)} is not a JSON value: ${reason}`);
	}
}
