import { ModelFailure } from "./model-failure";

/** The call did not answer within the time the caller allowed it. */
export class TimeoutFailure extends ModelFailure {
	public readonly kind = "timeout";

	public override get isTransient(): boolean {
		return true;
	}
}
