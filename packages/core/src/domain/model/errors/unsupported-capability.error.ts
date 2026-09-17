import { AdkError } from "../../../common/errors/adk.error";

/**
 * The call needs a capability the model never declared.
 * Raised before the request leaves, so the failure names the capability instead of
 * surfacing as a strange answer.
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
