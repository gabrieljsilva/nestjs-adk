import { AdkError } from "../../../common/errors/adk.error";

/** The class was read as an agent and `@Agent` never touched it. */
export class NotAnAgentClassError extends AdkError {
	public readonly code = "NOT_AN_AGENT_CLASS";

	public constructor(public readonly candidate: string) {
		super(`${candidate} is not decorated with @Agent, so it has no agent declaration to read.`);
	}
}
