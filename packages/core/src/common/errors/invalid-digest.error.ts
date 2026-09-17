import { AdkError } from "./adk.error";

export class InvalidDigestError extends AdkError {
	public readonly code = "COMMON_INVALID_DIGEST";

	public constructor(
		public readonly algorithm: string,
		public readonly value: string,
	) {
		super(
			`ContentDigest requires a non-empty algorithm and value, received ${JSON.stringify(algorithm)} and ${JSON.stringify(value)}.`,
		);
	}
}
