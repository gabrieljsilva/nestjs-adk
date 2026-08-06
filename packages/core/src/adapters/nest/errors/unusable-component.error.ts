import { AdkError } from "../../../common/errors/adk.error";

/**
 * A class declares `@Agent` or `@Tool` and the runtime cannot take the instance behind it.
 *
 * It is raised instead of skipping the provider, because a component that quietly vanishes
 * from the catalog comes back later as a model calling a tool nobody registered, or as an
 * agent name that does not exist, and neither says what actually happened.
 */
export class UnusableComponentError extends AdkError {
	public readonly code = "NEST_UNUSABLE_COMPONENT";

	public constructor(
		public readonly providerName: string,
		public readonly reason: string,
	) {
		super(`Provider ${providerName} declares an ADK component the runtime cannot use: ${reason}`);
	}
}
