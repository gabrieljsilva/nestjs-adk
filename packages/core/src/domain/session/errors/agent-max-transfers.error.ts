import { AdkError } from "../../../common/errors/adk.error";

/** The run handed the session between agents past the cap, which is always on, and was stopped. */
export class AgentMaxTransfersError extends AdkError {
	public readonly code = "AGENT_MAX_TRANSFERS";

	public constructor(
		public readonly agent: string,
		public readonly limit: number,
	) {
		super(`The run reached its limit of ${limit} transfer(s) at agent ${agent} and was stopped.`);
	}
}
