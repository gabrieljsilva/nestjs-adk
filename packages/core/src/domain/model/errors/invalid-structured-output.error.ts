import { AdkError } from "../../../common/errors/adk.error";

/**
 * The model answered something other than the shape the call asked for.
 * The raw answer travels with the error, because the usual causes are visible in it:
 * prose around the JSON, a truncated object, or a refusal written in words.
 */
export class InvalidStructuredOutputError extends AdkError {
	public readonly code = "MODEL_INVALID_STRUCTURED_OUTPUT";

	public constructor(
		public readonly reason: string,
		public readonly answer: string,
	) {
		super(`Model answered outside the requested shape: ${reason}`);
	}
}
