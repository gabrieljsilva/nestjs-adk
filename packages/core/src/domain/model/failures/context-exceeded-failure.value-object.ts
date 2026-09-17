import { ModelFailure } from "./model-failure.value-object";

/** The request was larger than the window; sending it again changes nothing. */
export class ContextExceededFailure extends ModelFailure {
	public readonly kind = "context-exceeded";
}
