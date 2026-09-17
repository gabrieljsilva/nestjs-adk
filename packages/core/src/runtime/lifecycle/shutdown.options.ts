import { InvalidShutdownTimeoutError } from "./errors/invalid-shutdown-timeout.error";

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
