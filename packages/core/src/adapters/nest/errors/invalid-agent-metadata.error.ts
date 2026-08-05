import { AdkError } from "../../../common/errors/adk.error";

/** A provider carries agent metadata that does not describe an agent. */
export class InvalidAgentMetadataError extends AdkError {
	public readonly code = "NEST_INVALID_AGENT_METADATA";

	public constructor(
		public readonly providerName: string,
		public readonly reason: string,
	) {
		super(`Provider ${providerName} declares invalid agent metadata: ${reason}`);
	}
}
