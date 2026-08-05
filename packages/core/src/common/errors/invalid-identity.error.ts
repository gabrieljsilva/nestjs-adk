import { AdkError } from "./adk.error";

/** A typed identity was built from text that carries no value. */
export class InvalidIdentityError extends AdkError {
	public readonly code = "COMMON_INVALID_IDENTITY";

	public constructor(
		public readonly owner: string,
		public readonly received: string,
	) {
		super(`${owner} requires non-empty text, received ${JSON.stringify(received)}.`);
	}
}
