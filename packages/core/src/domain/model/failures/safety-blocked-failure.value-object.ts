import { ModelFailure } from "./model-failure.value-object";

/** The provider refused on safety grounds; another attempt would be refused too. */
export class SafetyBlockedFailure extends ModelFailure {
	public readonly kind = "safety-blocked";
}
