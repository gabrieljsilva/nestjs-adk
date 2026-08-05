import { AdkError } from "../../../common/errors/adk.error";

/** The description is what another agent reads when deciding to transfer or delegate. */
export class MissingAgentDescriptionError extends AdkError {
	public readonly code = "AGENT_MISSING_DESCRIPTION";

	public constructor(public readonly agentName: string) {
		super(`Agent ${agentName} must declare a description; it is how other agents decide to reach it.`);
	}
}
