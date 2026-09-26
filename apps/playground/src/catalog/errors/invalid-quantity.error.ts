import { AdkError } from "@nestjs-adk/core";

export class InvalidQuantityError extends AdkError {
	public readonly code = "PLAYGROUND_INVALID_QUANTITY";

	public constructor(public readonly received: number) {
		super(`A quote is for one copy or more, and ${received} is not.`);
	}
}
