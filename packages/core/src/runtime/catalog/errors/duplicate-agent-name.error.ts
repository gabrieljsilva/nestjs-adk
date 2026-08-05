import { AdkError } from "../../../common/errors/adk.error";

/** Two providers claim the same agent name, so a command could not be routed. */
export class DuplicateAgentNameError extends AdkError {
	public readonly code = "CATALOG_DUPLICATE_AGENT_NAME";

	public constructor(
		public readonly agentName: string,
		public readonly first: string,
		public readonly second: string,
	) {
		super(`Agent name ${agentName} is declared by both ${first} and ${second}; names normalize to a single value.`);
	}
}
