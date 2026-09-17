import { InvalidRunLimitError } from "../errors/invalid-run-limit.error";

/**
 * How far one run may go before the runtime stops it. A limit is declared or absent, and absence
 * is not zero: an unset cap means the run is bounded by the model. `byDefault()` is what the
 * runtime starts from and `unbounded()` has to be asked for; anything but a whole number above
 * zero throws `InvalidRunLimitError`. The module default is overridden by the agent, then by the
 * call.
 */
export class RunLimits {
	public static readonly DEFAULT_MAX_INVALID_ARGS = 2;

	public static readonly DEFAULT_MAX_ITERATIONS = 50;

	public readonly maxIterations: number | undefined;
	public readonly maxConsecutiveToolFailures: number | undefined;
	public readonly maxInvalidArgs: number | undefined;

	public constructor(maxIterations?: number, maxConsecutiveToolFailures?: number, maxInvalidArgs?: number) {
		this.maxIterations = RunLimits.checked("maxIterations", maxIterations);
		this.maxConsecutiveToolFailures = RunLimits.checked("maxConsecutiveToolFailures", maxConsecutiveToolFailures);
		this.maxInvalidArgs = RunLimits.checked("maxInvalidArgs", maxInvalidArgs);
	}

	public static byDefault(): RunLimits {
		return new RunLimits(RunLimits.DEFAULT_MAX_ITERATIONS, undefined, undefined);
	}

	public static unbounded(): RunLimits {
		return new RunLimits(undefined, undefined, undefined);
	}

	public overriddenBy(other?: RunLimits): RunLimits {
		if (other === undefined) return this;
		return new RunLimits(
			other.maxIterations ?? this.maxIterations,
			other.maxConsecutiveToolFailures ?? this.maxConsecutiveToolFailures,
			other.maxInvalidArgs ?? this.maxInvalidArgs,
		);
	}

	public get invalidArgsLimit(): number {
		return this.maxInvalidArgs ?? RunLimits.DEFAULT_MAX_INVALID_ARGS;
	}

	public get hasIterationLimit(): boolean {
		return this.maxIterations !== undefined;
	}

	public allowsIteration(done: number): boolean {
		return this.maxIterations === undefined || done < this.maxIterations;
	}

	public allowsToolFailures(consecutive: number): boolean {
		return this.maxConsecutiveToolFailures === undefined || consecutive < this.maxConsecutiveToolFailures;
	}

	public allowsInvalidArgs(count: number): boolean {
		return count < this.invalidArgsLimit;
	}

	private static checked(limit: string, value?: number): number | undefined {
		if (value === undefined) return undefined;
		if (!Number.isSafeInteger(value) || value < 1) throw new InvalidRunLimitError(limit, value);
		return value;
	}
}
