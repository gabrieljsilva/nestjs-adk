import { AdkError } from "../../../common/errors/adk.error";

/** An agent without a name cannot be discovered, addressed or transferred to. */
export class MissingAgentNameError extends AdkError {
	public readonly code = "AGENT_MISSING_NAME";

	public constructor(public readonly received: string) {
		super(`Agent name must carry at least one character, received ${JSON.stringify(received)}.`);
	}
}
