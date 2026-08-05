import { AdkError } from "../../../common/errors/adk.error";

/**
 * The call was stopped before its effect, because a policy wants a human to agree first.
 *
 * It is a control signal and not a fault: the run catches it, records that approval was
 * asked for and suspends. It is an error rather than a return value so that no caller
 * can read past the gate by accident, which is the one mistake this whole mechanism
 * exists to prevent.
 */
export class ToolApprovalRequiredError extends AdkError {
	public readonly code = "TOOL_APPROVAL_REQUIRED";

	public constructor(
		public readonly toolName: string,
		public readonly callId: string,
		public readonly effect: string,
	) {
		super(`Tool ${toolName} is ${effect} and needs approval before call ${callId} can run.`);
	}
}
