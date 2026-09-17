import { ModelFailure } from "./model-failure";

/** The provider is down, overloaded or unreachable. */
export class UnavailableFailure extends ModelFailure {
	public readonly kind = "unavailable";

	public override get isTransient(): boolean {
		return true;
	}
}
