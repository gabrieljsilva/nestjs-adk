import { AdkError } from "../../../common/errors/adk.error";

export class MissingActorIdError extends AdkError {
	public readonly code = "TOOL_MISSING_ACTOR_ID";

	public constructor() {
		super("An actor needs an id: an empty one would let every caller look like the same person.");
	}
}
