import { AdkError } from "../../../common/errors/adk.error";

/**
 * The prepared context does not fit the window the model declared.
 *
 * Nothing is silently truncated: the caller learns how much was asked for and how much
 * there was, so it can compact, shorten the input or pick a larger model on purpose.
 *
 * The size is a projection of the last measured call over the text as it now stands,
 * which is the only size anything but the provider can know before the call.
 */
export class ContextBudgetExceededError extends AdkError {
	public readonly code = "CONTEXT_BUDGET_EXCEEDED";

	public constructor(
		public readonly model: string,
		public readonly requestedTokens: number,
		public readonly availableTokens: number,
	) {
		super(
			`Context for ${model} projects ${requestedTokens} input tokens but only ${availableTokens} are available in its window.`,
		);
	}
}
