import { AdkError } from "../../../common/errors/adk.error";

export class UnknownDelegationTargetError extends AdkError {
	public readonly code = "CATALOG_UNKNOWN_DELEGATION_TARGET";

	public constructor(
		public readonly agentName: string,
		public readonly target: string,
		public readonly known: readonly string[],
	) {
		super(
			`Agent ${agentName} declares a delegation to ${target}, which is not registered. Known agents: ${known.join(", ") || "none"}.`,
		);
	}
}
