import { AdkError } from "../../../common/errors/adk.error";

/**
 * `forRootAsync` was given more than one way to build the options.
 *
 * Only one of them can answer, so the others are configuration nothing reads: a `useClass`
 * sitting next to a `useFactory` looks exactly like the class that is building the options
 * right up to the moment somebody changes it and nothing happens.
 */
export class ConflictingAsyncOptionsError extends AdkError {
	public readonly code = "CONFLICTING_ASYNC_OPTIONS";

	public constructor(public readonly declared: readonly string[]) {
		super(
			`AdkModule.forRootAsync declares ${ConflictingAsyncOptionsError.listed(declared)}. Only one of them can say where the options come from, so the rest would be configuration nothing reads.`,
		);
	}

	private static listed(declared: readonly string[]): string {
		if (declared.length < 3) return declared.join(" and ");
		return `${declared.slice(0, -1).join(", ")} and ${declared[declared.length - 1]}`;
	}
}
