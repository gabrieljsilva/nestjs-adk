import { AdkError } from "../../../common/errors/adk.error";

/**
 * A delegation asked for a delegation asked for a delegation, and it was stopped.
 *
 * Depth is what separates "ask a specialist" from a tree of agents nobody can read. Like
 * the transfer cap and unlike the iteration limit, it is not opt in: an unbounded chain is
 * never what the developer meant, and each level multiplies what the question costs.
 */
export class AgentMaxDelegationDepthError extends AdkError {
	public readonly code = "AGENT_MAX_DELEGATION_DEPTH";

	public constructor(
		public readonly agent: string,
		public readonly limit: number,
	) {
		super(`Agent ${agent} delegated past the maximum depth of ${limit} and the run was stopped.`);
	}
}
