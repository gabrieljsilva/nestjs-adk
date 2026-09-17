import { AdkError } from "../../../common/errors/adk.error";

/** A chain of delegations went deeper than the cap, which is always on, and the run was stopped. */
export class AgentMaxDelegationDepthError extends AdkError {
	public readonly code = "AGENT_MAX_DELEGATION_DEPTH";

	public constructor(
		public readonly agent: string,
		public readonly limit: number,
	) {
		super(`Agent ${agent} delegated past the maximum depth of ${limit} and the run was stopped.`);
	}
}
