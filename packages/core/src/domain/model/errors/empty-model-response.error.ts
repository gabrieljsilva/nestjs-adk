import { AdkError } from "../../../common/errors/adk.error";

/**
 * The provider answered with no text and asked for no tool.
 * The run fails rather than completing, so it is never mistaken for an agent that chose
 * to say nothing.
 */
export class EmptyModelResponseError extends AdkError {
	public readonly code = "EMPTY_MODEL_RESPONSE";

	public constructor(
		public readonly agent: string,
		public readonly model: string,
	) {
		super(`Model ${model} answered agent ${agent} with no text and no tool call.`);
	}
}
