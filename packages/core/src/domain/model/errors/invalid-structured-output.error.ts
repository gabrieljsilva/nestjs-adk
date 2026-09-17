import { AdkError } from "../../../common/errors/adk.error";

/**
 * The model answered something other than the shape the call asked for.
 * The raw answer travels on `answer`, where the usual causes are visible.
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
