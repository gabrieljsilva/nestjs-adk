import { AdkError } from "../../../common/errors/adk.error";

/**
 * Work was asked to be handed to an agent this one never declared.
 * Refused before a child run exists, so nothing reaches the journal.
 */
export class DelegationNotDeclaredError extends AdkError {
	public readonly code = "DELEGATION_NOT_DECLARED";

	public constructor(
		public readonly from: string,
		public readonly to: string,
		public readonly declared: readonly string[],
	) {
		super(
			`Agent ${from} does not declare a delegation to ${to}. Declared: ${declared.length === 0 ? "none" : declared.join(", ")}.`,
		);
	}
}
