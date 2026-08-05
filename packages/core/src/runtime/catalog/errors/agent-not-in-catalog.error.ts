import { AdkError } from "../../../common/errors/adk.error";

/** Nothing in the catalog answers to this name. */
export class AgentNotInCatalogError extends AdkError {
	public readonly code = "CATALOG_AGENT_NOT_FOUND";

	public constructor(
		public readonly agentName: string,
		public readonly known: readonly string[],
	) {
		super(`No agent named ${agentName} is registered. Known agents: ${known.join(", ") || "none"}.`);
	}
}
