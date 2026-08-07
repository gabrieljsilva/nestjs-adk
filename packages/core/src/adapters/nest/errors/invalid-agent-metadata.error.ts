import { AdkError } from "../../../common/errors/adk.error";

/**
 * A provider carries agent metadata that does not describe an agent.
 *
 * When reading the declaration is what failed, the original error is preserved as `cause`:
 * a reference to another agent is evaluated here, and whatever it threw is the only thing
 * that says why.
 */
export class InvalidAgentMetadataError extends AdkError {
	public readonly code = "NEST_INVALID_AGENT_METADATA";

	public constructor(
		public readonly providerName: string,
		public readonly reason: string,
		cause?: unknown,
	) {
		super(
			`Provider ${providerName} declares invalid agent metadata: ${reason}`,
			cause === undefined ? undefined : { cause },
		);
	}
}
