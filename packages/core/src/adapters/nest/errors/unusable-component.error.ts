import { AdkError } from "../../../common/errors/adk.error";

/** Raised at boot: a provider declares an ADK component the runtime cannot use, naming the provider and why. */
export class UnusableComponentError extends AdkError {
	public readonly code = "NEST_UNUSABLE_COMPONENT";

	public constructor(
		public readonly providerName: string,
		public readonly reason: string,
	) {
		super(`Provider ${providerName} declares an ADK component the runtime cannot use: ${reason}`);
	}
}
