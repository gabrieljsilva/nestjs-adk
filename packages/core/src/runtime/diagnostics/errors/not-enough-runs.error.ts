import { AdkError } from "../../../common/errors/adk.error";

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
