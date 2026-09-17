import { AdkError } from "../../../common/errors/adk.error";

export class MissingAgentNameError extends AdkError {
	public readonly code = "AGENT_MISSING_NAME";

	public constructor(public readonly received: string) {
		super(`Agent name must carry at least one character, received ${JSON.stringify(received)}.`);
	}
}
