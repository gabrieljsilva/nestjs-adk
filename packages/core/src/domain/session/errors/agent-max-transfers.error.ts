import { AdkError } from "../../../common/errors/adk.error";

/**
 * The run passed the session around until it was stopped.
 *
 * Two agents that each think the other should handle a question will hand it back and
 * forth forever, and every hop is a model call somebody pays for. Unlike the iteration
 * limit this one is not opt in: a cycle is never what the developer meant, so the runtime
 * caps it whether or not anybody asked.
 */
export class AgentMaxTransfersError extends AdkError {
	public readonly code = "AGENT_MAX_TRANSFERS";

	public constructor(
		public readonly agent: string,
		public readonly limit: number,
	) {
		super(`The run reached its limit of ${limit} transfer(s) at agent ${agent} and was stopped.`);
	}
}
