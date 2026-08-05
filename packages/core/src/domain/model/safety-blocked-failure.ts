import { ModelFailure } from "./model-failure";

/** The provider refused on safety grounds; another attempt would be refused too. */
export class SafetyBlockedFailure extends ModelFailure {
	public readonly kind = "safety-blocked";
}
