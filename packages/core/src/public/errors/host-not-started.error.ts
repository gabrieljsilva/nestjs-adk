import { AdkError } from "../../common/errors/adk.error";

/** The runtime was asked for before the NestJS lifecycle had initialized it. */
export class HostNotStartedError extends AdkError {
	public readonly code = "RUNTIME_HOST_NOT_STARTED";

	public constructor() {
		super("The ADK runtime has not started yet; it becomes available after the NestJS module initializes.");
	}
}
