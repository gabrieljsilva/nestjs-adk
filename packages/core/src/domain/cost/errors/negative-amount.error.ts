import { AdkError } from "../../../common/errors/adk.error";

/**
 * An amount or a token count below zero reached a cost value.
 *
 * Thrown where the value is built rather than where it is summed, so the trace points at the
 * rate or the usage that was wrong.
 */
export class NegativeAmountError extends AdkError {
	public readonly code = "COST_NEGATIVE_AMOUNT";

	public constructor(public readonly value: string) {
		super(`A cost cannot be negative, and "${value}" is.`);
	}
}
