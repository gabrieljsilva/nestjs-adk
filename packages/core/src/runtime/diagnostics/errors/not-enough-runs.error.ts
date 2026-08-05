import { AdkError } from "../../../common/errors/adk.error";

/** Cache efficiency over a single run has no answer, because nothing warmed the cache yet. */
export class NotEnoughRunsError extends AdkError {
	public readonly code = "NOT_ENOUGH_RUNS";

	public constructor(
		public readonly received: number,
		public readonly required: number,
	) {
		super(
			`Cache efficiency needs at least ${required} runs, because the first one warms the cache; received ${received}.`,
		);
	}
}
