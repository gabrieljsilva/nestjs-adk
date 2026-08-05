import { AdkError } from "../../../common/errors/adk.error";

/**
 * The run kept going back to the model and was stopped at the limit it was given.
 *
 * Each iteration is one model call plus the tools it asked for, so a loop here is a loop
 * on someone's bill. The limit is opt in: without one the run is bounded by the model
 * deciding it is done, which is the right default for an agent nobody constrained.
 */
export class AgentMaxIterationsError extends AdkError {
	public readonly code = "AGENT_MAX_ITERATIONS";

	public constructor(
		public readonly agent: string,
		public readonly limit: number,
	) {
		super(`Agent ${agent} reached its limit of ${limit} iteration(s) and the run was stopped.`);
	}
}
