/** Large enough that ordinary results pass, small enough that one result cannot fill a window. */
const DEFAULT_THRESHOLD = 20_000;

/**
 * When a result is too large to sit in the context, and when it is nobody's problem.
 *
 * The threshold is in characters rather than tokens, for the same reason everything
 * before a call is: tokens are a number the provider reports afterwards, and a decision
 * that has to be taken before the call cannot wait for one.
 *
 * Disabling it is a real answer. An application that would rather pay for a large prompt
 * than have the model make a second call says so, and nothing is moved out.
 */
export class OffloadPolicy {
	public static readonly DEFAULT_THRESHOLD = DEFAULT_THRESHOLD;

	private constructor(private readonly threshold: number | undefined) {}

	public static byDefault(): OffloadPolicy {
		return new OffloadPolicy(DEFAULT_THRESHOLD);
	}

	public static above(threshold: number): OffloadPolicy {
		return new OffloadPolicy(Math.max(0, Math.trunc(threshold)));
	}

	public static disabled(): OffloadPolicy {
		return new OffloadPolicy(undefined);
	}

	public get isEnabled(): boolean {
		return this.threshold !== undefined;
	}

	public get thresholdCharacters(): number | undefined {
		return this.threshold;
	}

	public shouldOffload(characters: number): boolean {
		return this.threshold !== undefined && characters > this.threshold;
	}
}
