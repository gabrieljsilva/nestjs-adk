import { AdkError } from "../../../common/errors/adk.error";

/** Raised at boot: `AdkModule.forRootAsync` was given none of `useFactory`, `useClass` and `useExisting`. */
export class AsyncOptionsNotDeclaredError extends AdkError {
	public readonly code = "ASYNC_OPTIONS_NOT_DECLARED";

	public constructor() {
		super(
			"AdkModule.forRootAsync declares none of useFactory, useClass or useExisting. One of the three has to say where the options come from.",
		);
	}
}
