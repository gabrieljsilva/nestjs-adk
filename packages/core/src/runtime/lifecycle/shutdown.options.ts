import { InvalidShutdownTimeoutError } from "./errors/invalid-shutdown-timeout.error";

/**
 * How long shutdown waits for active runs before it stops waiting.
 * Waiting without a limit is the default: cutting a run short loses work that the
 * application may not be able to redo.
 */
export class ShutdownOptions {
	private constructor(public readonly timeoutMs: number | undefined) {}

	public static withTimeout(milliseconds: number): ShutdownOptions {
		if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
			throw new InvalidShutdownTimeoutError(milliseconds);
		}
		return new ShutdownOptions(milliseconds);
	}

	public static waitIndefinitely(): ShutdownOptions {
		return new ShutdownOptions(undefined);
	}

	public get waitsIndefinitely(): boolean {
		return this.timeoutMs === undefined;
	}
}
