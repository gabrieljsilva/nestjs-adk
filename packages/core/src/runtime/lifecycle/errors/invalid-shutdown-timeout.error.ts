import { AdkError } from "../../../common/errors/adk.error";

/** A shutdown timeout has to be a real amount of time to wait. */
export class InvalidShutdownTimeoutError extends AdkError {
	public readonly code = "RUNTIME_INVALID_SHUTDOWN_TIMEOUT";

	public constructor(public readonly received: number) {
		super(
			`Shutdown timeout must be a positive integer in milliseconds, received ${received}. Use ShutdownOptions.waitIndefinitely() to wait without a limit.`,
		);
	}
}
