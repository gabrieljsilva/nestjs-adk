import { AdkError } from "../../common/errors/adk.error";

/**
 * The class was used as an agent before the runtime knew it was one: it is missing `@Agent`,
 * is not a provider of an imported module, or was used before the container finished building.
 */
export class AgentNotBoundError extends AdkError {
	public readonly code = "AGENT_NOT_BOUND";

	public constructor(public readonly agent: string) {
		super(
			`${agent} is not bound to a running agent. Declare it with @Agent, register it as a provider, and use it after the application has started.`,
		);
	}
}
