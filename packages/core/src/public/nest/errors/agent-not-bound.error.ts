import { AdkError } from "../../../common/errors/adk.error";

/**
 * The class was used as an agent before the runtime knew it was one.
 *
 * An `AdkAgent` is handed its handle when the module composes the runtime, so a class that
 * never reached that point is either missing `@Agent`, not registered as a provider of a
 * module the application imported, or being used before the container finished building.
 */
export class AgentNotBoundError extends AdkError {
	public readonly code = "AGENT_NOT_BOUND";

	public constructor(public readonly agent: string) {
		super(
			`${agent} is not bound to a running agent. Declare it with @Agent, register it as a provider, and use it after the application has started.`,
		);
	}
}
