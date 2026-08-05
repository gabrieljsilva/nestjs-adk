import { AdkError } from "../../../common/errors/adk.error";

/**
 * A tool result appeared in the journal without the call that asked for it.
 * The pair is what makes the context causal, so a result on its own stops the
 * projection instead of reaching the model as an answer to nothing.
 */
export class OrphanToolResultError extends AdkError {
	public readonly code = "CONTEXT_ORPHAN_TOOL_RESULT";

	public constructor(
		public readonly callId: string,
		public readonly toolName: string,
	) {
		super(`Tool result for call ${callId} of ${toolName} has no matching call in the journal.`);
	}
}
