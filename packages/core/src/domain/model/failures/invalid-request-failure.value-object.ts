import { ModelFailure } from "./model-failure.value-object";

/**
 * The provider refused the request itself rather than failing to answer it: a schema, a
 * field combination or a key it will not accept.
 * The next model in a chain would be sent the same thing, so a policy is told separately.
 */
export class InvalidRequestFailure extends ModelFailure {
	public readonly kind = "invalid-request";

	public override get isInvalidRequest(): boolean {
		return true;
	}
}
