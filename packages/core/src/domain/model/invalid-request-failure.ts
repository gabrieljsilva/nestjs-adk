import { ModelFailure } from "./model-failure";

/**
 * The provider refused the request itself, rather than failing to answer it.
 *
 * A schema it will not accept, a combination of fields this model does not support, a
 * key it does not recognise: what is wrong is what was sent, and the next model in a
 * chain is sent the same thing. That is the difference from every other failure here,
 * and the reason a policy is told about it separately.
 */
export class InvalidRequestFailure extends ModelFailure {
	public readonly kind = "invalid-request";

	public override get isInvalidRequest(): boolean {
		return true;
	}
}
