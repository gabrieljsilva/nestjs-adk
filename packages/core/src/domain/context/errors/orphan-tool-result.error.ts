import { AdkError } from "../../../common/errors/adk.error";

export class OrphanToolResultError extends AdkError {
	public readonly code = "CONTEXT_ORPHAN_TOOL_RESULT";

	public constructor(
		public readonly callId: string,
		public readonly toolName: string,
	) {
		super(`Tool result for call ${callId} of ${toolName} has no matching call in the journal.`);
	}
}
