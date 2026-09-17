import { AdkError } from "../../../common/errors/adk.error";

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
