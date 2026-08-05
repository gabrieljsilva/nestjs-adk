import { AdkError } from "../../../common/errors/adk.error";

/** The model is the only component an agent cannot do without. */
export class MissingAgentModelError extends AdkError {
	public readonly code = "AGENT_MISSING_MODEL";

	public constructor(public readonly agentName: string) {
		super(`Agent ${agentName} must resolve to exactly one primary model.`);
	}
}
