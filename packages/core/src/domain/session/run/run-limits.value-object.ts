import { InvalidRunLimitError } from "../errors/invalid-run-limit.error";

/**
 * How far one run may go before the runtime stops it.
 *
 * A limit is declared or absent, and absence is not zero: an unset iteration cap means
 * the run is bounded by the model and by the tools rather than by a number nobody chose.
 * That is what `unbounded()` means, and it has to be asked for: what the runtime starts
 * from is `byDefault()`, fifty iterations, because a model that loops on a tool it cannot
 * satisfy spends somebody's money until it is stopped, and a ceiling nobody chose is a
 * worse answer than one they can raise.
 * Invalid arguments are the one exception and default to two, because the model wrote
 * the argument and usually fixes it on the next try, while a model that cannot satisfy
 * the schema would otherwise loop on someone's bill.
 *
 * Resolution is by overriding, in the order the caller applies it: the module default
 * first, then the agent, then the call. A level that declared nothing leaves the level
 * under it exactly as it was.
 */
export class RunLimits {
	public static readonly DEFAULT_MAX_INVALID_ARGS = 2;

	/** High enough that no honest agent reaches it, low enough that a loop is paid for once. */
	public static readonly DEFAULT_MAX_ITERATIONS = 50;

	public readonly maxIterations: number | undefined;
	public readonly maxConsecutiveToolFailures: number | undefined;
	public readonly maxInvalidArgs: number | undefined;

	public constructor(maxIterations?: number, maxConsecutiveToolFailures?: number, maxInvalidArgs?: number) {
		this.maxIterations = RunLimits.checked("maxIterations", maxIterations);
		this.maxConsecutiveToolFailures = RunLimits.checked("maxConsecutiveToolFailures", maxConsecutiveToolFailures);
		this.maxInvalidArgs = RunLimits.checked("maxInvalidArgs", maxInvalidArgs);
	}

	/** What the runtime runs under when nobody declared anything. */
	public static byDefault(): RunLimits {
		return new RunLimits(RunLimits.DEFAULT_MAX_ITERATIONS, undefined, undefined);
	}

	/** No ceiling at all, which is a declaration and never an oversight. */
	public static unbounded(): RunLimits {
		return new RunLimits(undefined, undefined, undefined);
	}

	/** The level that declared a field wins it, and declares nothing by leaving it out. */
	public overriddenBy(other?: RunLimits): RunLimits {
		if (other === undefined) return this;
		return new RunLimits(
			other.maxIterations ?? this.maxIterations,
			other.maxConsecutiveToolFailures ?? this.maxConsecutiveToolFailures,
			other.maxInvalidArgs ?? this.maxInvalidArgs,
		);
	}

	/** The only limit that answers with a number even when nobody declared one. */
	public get invalidArgsLimit(): number {
		return this.maxInvalidArgs ?? RunLimits.DEFAULT_MAX_INVALID_ARGS;
	}

	public get hasIterationLimit(): boolean {
		return this.maxIterations !== undefined;
	}

	/** Whether a run that already completed `done` iterations may start another one. */
	public allowsIteration(done: number): boolean {
		return this.maxIterations === undefined || done < this.maxIterations;
	}

	public allowsToolFailures(consecutive: number): boolean {
		return this.maxConsecutiveToolFailures === undefined || consecutive < this.maxConsecutiveToolFailures;
	}

	public allowsInvalidArgs(count: number): boolean {
		return count < this.invalidArgsLimit;
	}

	/** A limit is a whole number of tries above zero, and anything else is a mistake at the source. */
	private static checked(limit: string, value?: number): number | undefined {
		if (value === undefined) return undefined;
		if (!Number.isSafeInteger(value) || value < 1) throw new InvalidRunLimitError(limit, value);
		return value;
	}
}
