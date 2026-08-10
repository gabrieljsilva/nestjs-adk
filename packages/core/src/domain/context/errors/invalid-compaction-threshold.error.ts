import { AdkError } from "../../../common/errors/adk.error";

/**
 * A compaction policy was configured with shares that cannot hold together.
 * Compacting to a target above the ceiling that triggered it would loop forever, and a
 * ceiling outside the window it is a share of never triggers at all, so both are refused
 * at composition time instead of at the first long conversation.
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
