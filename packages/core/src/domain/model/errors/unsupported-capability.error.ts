import { AdkError } from "../../../common/errors/adk.error";

/**
 * The call needs something the model never said it could do.
 * It is raised before the request leaves, so a model that cannot run tools fails saying
 * exactly that, instead of answering prose to a question that expected a tool call.
 */
export class UnsupportedCapabilityError extends AdkError {
	public readonly code = "MODEL_UNSUPPORTED_CAPABILITY";

	public constructor(
		public readonly model: string,
		public readonly capability: string,
	) {
		super(`Model ${model} does not declare the ${capability} capability, which this call requires.`);
	}
}
