import { MissingApiKeyError } from "./errors/missing-api-key.error";

/**
 * Whether a suite that spends money can run at all.
 *
 * A paid suite is skipped without a key rather than failed, so a checkout without one is
 * green. What used to follow that decision was a second check inside every case, because
 * the key is still optional to the compiler after `runIf` proved it is not: `key()` is
 * that check, once, with a message naming the variables it looked for.
 */
export class ApiKeyGate {
	private constructor(
		private readonly variables: readonly string[],
		private readonly found?: string,
	) {}

	/** The first of these environment variables that carries a key. */
	public static fromEnv(variables: readonly string[], environment: Record<string, string | undefined> = process.env) {
		const found = variables.map((name) => environment[name]).find((value) => value !== undefined && value.length > 0);
		return new ApiKeyGate(variables, found);
	}

	/** True when there is a key, which is what a `describe.runIf` takes. */
	public get present(): boolean {
		return this.found !== undefined;
	}

	public keyOrFail(): string {
		if (this.found === undefined) throw new MissingApiKeyError(this.variables);
		return this.found;
	}
}
