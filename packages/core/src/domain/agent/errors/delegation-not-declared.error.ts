import { AdkError } from "../../../common/errors/adk.error";

/**
 * Somebody asked for work to be handed to an agent this one never declared.
 *
 * It is refused before a child run exists, so a delegation nobody declared costs no model
 * call and leaves no half open delegation in the journal.
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
