import { AdkError } from "../../../common/errors/adk.error";

export class SessionClosedError extends AdkError {
	public readonly code = "SESSION_CLOSED";

	public constructor(
		public readonly sessionId: string,
		public readonly status: string,
	) {
		super(`Session ${sessionId} is ${status} and does not accept commands.`);
	}
}
