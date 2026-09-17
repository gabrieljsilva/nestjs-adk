import { AdkError } from "../../../common/errors/adk.error";

/** Raised at boot: `AdkModule.forRootAsync` was given more than one of `useFactory`, `useClass` and `useExisting`. */
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
