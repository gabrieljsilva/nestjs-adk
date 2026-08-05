import { AdkError } from "../../../common/errors/adk.error";

/**
 * An agent declared a delegation to something that was never registered.
 * It fails at boot for the same reason a transfer edge does: the alternative is a run that
 * asks nobody for an answer it is waiting on.
 */
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
