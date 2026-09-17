import { AdkError } from "../../../common/errors/adk.error";

/** Raised at boot: a provider lists a tool no provider in the container declares with `@Tool`. */
export class UnregisteredToolError extends AdkError {
	public readonly code = "NEST_UNREGISTERED_TOOL";

	public constructor(
		public readonly providerName: string,
		public readonly declared: string,
		public readonly registered: readonly string[],
	) {
		super(
			`Provider ${providerName} lists ${declared} among its tools, and no provider in the container declares it with @Tool. Registered tools: ${registered.join(", ") || "none"}.`,
		);
	}
}
