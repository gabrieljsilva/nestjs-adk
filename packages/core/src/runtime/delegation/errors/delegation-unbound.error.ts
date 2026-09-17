import { AdkError } from "../../../common/errors/adk.error";

export class DelegationUnboundError extends AdkError {
	public readonly code = "DELEGATION_UNBOUND";

	public constructor() {
		super("The delegation runner was never given a turn loop, so no child run can be started.");
	}
}
