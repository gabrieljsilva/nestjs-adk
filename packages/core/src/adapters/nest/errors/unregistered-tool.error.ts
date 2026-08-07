import { AdkError } from "../../../common/errors/adk.error";

/**
 * An agent lists a tool the container never registered as one.
 *
 * It fails at boot rather than composing an agent that is missing it, because a tool that
 * silently leaves the catalog is not visible anywhere: the model is simply never offered it,
 * answers without it, and the run that results looks like a bad answer instead of a wiring
 * mistake. Naming what was found is half the message, since the usual cause is a class that
 * is in `tools` but not in `providers`.
 */
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
