import { AdkError } from "../../../common/errors/adk.error";

/** The run reached the iteration limit it was given and was stopped before the next model call. */
export class AgentMaxIterationsError extends AdkError {
	public readonly code = "AGENT_MAX_ITERATIONS";

	public constructor(
		public readonly agent: string,
		public readonly limit: number,
	) {
		super(`Agent ${agent} reached its limit of ${limit} iteration(s) and the run was stopped.`);
	}
}
