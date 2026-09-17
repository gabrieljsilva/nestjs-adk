import { AdkError } from "../../../common/errors/adk.error";

/**
 * A compaction policy was configured with shares that cannot hold together, and is
 * refused at composition time rather than at the first long conversation.
 */
export class InvalidCompactionThresholdError extends AdkError {
	public readonly code = "CONTEXT_INVALID_COMPACTION_THRESHOLD";

	public constructor(
		public readonly maxShare: number,
		public readonly targetShare: number,
	) {
		super(
			`Compaction target of ${targetShare} must be a positive share of the window below the ceiling of ${maxShare}, which must itself be at most 1.`,
		);
	}
}
