import { AdkError } from "../../../common/errors/adk.error";

/**
 * A threshold policy was configured with numbers that cannot hold together.
 * Compacting to a target above the ceiling that triggered it would loop forever, so it
 * is refused at composition time instead of at the first long conversation.
 */
export class InvalidCompactionThresholdError extends AdkError {
	public readonly code = "CONTEXT_INVALID_COMPACTION_THRESHOLD";

	public constructor(
		public readonly maxTokens: number,
		public readonly targetTokens: number,
	) {
		super(
			`Compaction target of ${targetTokens} tokens must be a positive number below the ceiling of ${maxTokens} tokens.`,
		);
	}
}
