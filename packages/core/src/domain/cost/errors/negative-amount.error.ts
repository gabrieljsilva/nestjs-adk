import { AdkError } from "../../../common/errors/adk.error";

/**
 * An amount or a token count below zero reached a cost value.
 *
 * Refused where it is built rather than where it is summed, so the stack trace points at
 * the rate or the usage that was wrong instead of at the total that came out strange. A
 * negative cost is never a discount here: it is a provider payload or a conversion nobody
 * validated, and a total that quietly shrinks is worse than a boot that stops.
 */
export class NegativeAmountError extends AdkError {
	public readonly code = "COST_NEGATIVE_AMOUNT";

	public constructor(public readonly value: string) {
		super(`A cost cannot be negative, and "${value}" is.`);
	}
}
