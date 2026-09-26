import { AdkError } from "@nestjs-adk/core";

export class InvalidRowError extends AdkError {
	public readonly code = "PLAYGROUND_INVALID_ROW";

	public constructor(
		public readonly column: string,
		public readonly expected: string,
	) {
		super(`Column ${column} does not hold ${expected}.`);
	}
}
