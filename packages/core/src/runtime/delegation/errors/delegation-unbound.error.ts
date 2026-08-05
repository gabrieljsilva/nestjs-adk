import { AdkError } from "../../../common/errors/adk.error";

/**
 * The delegation runner was built and never given the loop it runs turns with.
 * It can only mean a composition that skipped a step, so it says so instead of failing
 * later as a missing answer.
 */
export class DelegationUnboundError extends AdkError {
	public readonly code = "DELEGATION_UNBOUND";

	public constructor() {
		super("The delegation runner was never given a turn loop, so no child run can be started.");
	}
}
