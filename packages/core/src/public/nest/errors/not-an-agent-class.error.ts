import { AdkError } from "../../../common/errors/adk.error";

/** The class handed over was never decorated with `@Agent`, so it has no declaration to read. */
export class NotAnAgentClassError extends AdkError {
	public readonly code = "NOT_AN_AGENT_CLASS";

	public constructor(public readonly candidate: string) {
		super(`${candidate} is not decorated with @Agent, so it has no agent declaration to read.`);
	}
}
