import { AdkError } from "../../../common/errors/adk.error";

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
