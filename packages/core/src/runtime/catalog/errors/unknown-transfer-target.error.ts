import { AdkError } from "../../../common/errors/adk.error";

/**
 * An agent declared a handover to something that was never registered.
 *
 * It fails at boot rather than mid conversation, because the alternative is a session
 * that transfers itself to nobody halfway through answering somebody.
 */
export class UnknownTransferTargetError extends AdkError {
	public readonly code = "CATALOG_UNKNOWN_TRANSFER_TARGET";

	public constructor(
		public readonly agentName: string,
		public readonly target: string,
		public readonly known: readonly string[],
	) {
		super(
			`Agent ${agentName} declares a transfer to ${target}, which is not registered. Known agents: ${known.join(", ") || "none"}.`,
		);
	}
}
