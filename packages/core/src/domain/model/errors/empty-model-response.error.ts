import { AdkError } from "../../../common/errors/adk.error";

/**
 * The provider answered with no text and asked for no tool.
 *
 * There is nothing to record and nothing to continue from, so the run fails instead of
 * completing: a run that ends successfully with an empty answer looks to every caller
 * like an agent that decided to say nothing, which is not what happened.
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
