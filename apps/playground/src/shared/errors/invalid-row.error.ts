import { AdkError } from "@nestjs-adk/core";

/**
 * A row the database handed back does not hold what this code expects in a column.
 *
 * It names the column and the shape that was wanted, because the alternative is an
 * `undefined` travelling two layers and failing where nothing knows where it came from.
 */
export class InvalidRowError extends AdkError {
	public readonly code = "PLAYGROUND_INVALID_ROW";

	public constructor(
		public readonly column: string,
		public readonly expected: string,
	) {
		super(`Column ${column} does not hold ${expected}.`);
	}
}
