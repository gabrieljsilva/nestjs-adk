import { AdkError } from "../../../common/errors/adk.error";

/**
 * A handover was asked for to an agent this one never declared.
 * Refused before anything is journaled, and the session stays with whoever already had it.
 */
export class TransferNotDeclaredError extends AdkError {
	public readonly code = "TRANSFER_NOT_DECLARED";

	public constructor(
		public readonly from: string,
		public readonly to: string,
		public readonly declared: readonly string[],
	) {
		super(
			`Agent ${from} does not declare a transfer to ${to}. Declared: ${declared.length === 0 ? "none" : declared.join(", ")}.`,
		);
	}
}
