import { AdkError } from "./adk.error";

export class InvalidIdentityError extends AdkError {
	public readonly code = "COMMON_INVALID_IDENTITY";

	public constructor(
		public readonly owner: string,
		public readonly received: string,
	) {
		super(`${owner} requires non-empty text, received ${JSON.stringify(received)}.`);
	}
}
