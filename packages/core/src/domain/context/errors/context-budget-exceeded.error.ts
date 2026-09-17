import { AdkError } from "../../../common/errors/adk.error";

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
