import { OffloadPolicy } from "./offload-policy";

/** Large enough that ordinary results pass, small enough that one result cannot fill a window. */
const DEFAULT_THRESHOLD = 20_000;

/**
 * Moves a result out once it is longer than a declared number of characters.
 *
 * Disabling it is a real answer. An application that would rather pay for a large prompt
 * than have the model make a second call says so, and nothing is moved out.
 */
export class CharacterCountOffloadPolicy extends OffloadPolicy {
	public static readonly DEFAULT_THRESHOLD = DEFAULT_THRESHOLD;

	private constructor(private readonly threshold: number | undefined) {
		super();
	}

	public static byDefault(): CharacterCountOffloadPolicy {
		return new CharacterCountOffloadPolicy(DEFAULT_THRESHOLD);
	}

	public static above(threshold: number): CharacterCountOffloadPolicy {
		return new CharacterCountOffloadPolicy(Math.max(0, Math.trunc(threshold)));
	}

	public static disabled(): CharacterCountOffloadPolicy {
		return new CharacterCountOffloadPolicy(undefined);
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
