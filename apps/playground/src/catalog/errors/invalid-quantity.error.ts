import { AdkError } from "@nestjs-adk/core";

/** A quote was asked for a number of copies nobody can buy. */
export class InvalidQuantityError extends AdkError {
	public readonly code = "PLAYGROUND_INVALID_QUANTITY";

	public constructor(public readonly received: number) {
		super(`A quote is for one copy or more, and ${received} is not.`);
	}
}
