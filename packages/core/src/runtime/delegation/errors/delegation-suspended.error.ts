import { AdkError } from "../../../common/errors/adk.error";

/**
 * A delegated run stopped in front of a human, and nothing can continue it yet.
 *
 * Approval resumes a run by opening a new one that points back at the suspended one, and a
 * child run has no such entry point: nobody can ask for it from outside, because it only
 * exists inside the turn that asked for it. Failing loudly is the honest answer, since the
 * alternative is a session that reads as waiting for a decision nobody can act on.
 */
export class DelegationSuspendedError extends AdkError {
	public readonly code = "DELEGATION_SUSPENDED";

	public constructor(
		public readonly from: string,
		public readonly to: string,
	) {
		super(
			`Agent ${to}, delegated to by ${from}, stopped for an approval. A delegated run cannot be resumed, so declare the tool without an effect or reach ${to} by transfer instead.`,
		);
	}
}
