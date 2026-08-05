import { AdkError } from "../../../common/errors/adk.error";

/**
 * Somebody asked for a handover this agent never declared.
 *
 * The edges are the whole point of transfer being safe: an agent that can reach any other
 * agent is an agent with no boundary at all. So the refusal happens before anything is
 * journaled, and the session stays with whoever already had it.
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
