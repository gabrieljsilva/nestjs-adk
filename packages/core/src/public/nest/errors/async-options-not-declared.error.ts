import { AdkError } from "../../../common/errors/adk.error";

/**
 * `forRootAsync` was given no way to build the options.
 *
 * Without one of the three the module would compose on nothing, and the first thing an
 * application would see is an agent failing to answer rather than a module that was never
 * configured. It is raised where `forRootAsync` is called, which is before the boot starts.
 */
export class AsyncOptionsNotDeclaredError extends AdkError {
	public readonly code = "ASYNC_OPTIONS_NOT_DECLARED";

	public constructor() {
		super(
			"AdkModule.forRootAsync declares none of useFactory, useClass or useExisting. One of the three has to say where the options come from.",
		);
	}
}
