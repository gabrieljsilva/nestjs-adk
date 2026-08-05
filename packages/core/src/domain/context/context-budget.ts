import type { ContextWindow } from "../model/context-window";
import type { ModelIdentity } from "../model/model-identity";
import type { ModelUsage } from "../model/model-usage";
import { TokenCount } from "../model/token-count";
import type { ContextComposition } from "./context-composition";
import { ContextBudgetExceededError } from "./errors/context-budget-exceeded.error";

/**
 * How much of the window is spoken for, and how much is still free.
 *
 * Both numbers exist only when two things are true: the model declared a window, and a
 * call already reported its usage. Nothing here derives tokens from text, so a budget
 * before the first call of a session has a composition and no size, and says so through
 * `isMeasured` rather than through a zero that reads like room to spare.
 *
 * There are two kinds of answer here and they are named apart, because they are not the
 * same kind of fact. What is measured is what the provider counted for the previous call.
 * What is projected is that measurement carried to the prompt as it stands now, scaled by
 * how much the text has grown since, and it answers plain numbers rather than a
 * `TokenCount`: a `TokenCount` means somebody counted, and here nobody did.
 *
 * Every question about the call that is about to happen is necessarily a projection: the
 * only thing that knows the real size of this prompt is the provider, and asking it is
 * the call. So refusing early is refusing on a projection, and the wording says so.
 */
export class ContextBudget {
	public constructor(
		public readonly window: ContextWindow,
		public readonly composition: ContextComposition,
		public readonly usage?: ModelUsage,
		private readonly measuredAtCharacters?: number,
	) {}

	public get isWindowKnown(): boolean {
		return this.window.isKnown;
	}

	/** True when a provider has reported usage for this context, which is the only source of a size. */
	public get isMeasured(): boolean {
		return this.usage !== undefined;
	}

	/** Both the window and a measured usage, which is what any free room answer needs. */
	public get isKnown(): boolean {
		return this.isWindowKnown && this.isMeasured;
	}

	/** What the provider counted for the previous call, and nothing derived from it. */
	public get usedTokens(): TokenCount | undefined {
		const usage = this.usage;
		return usage === undefined ? undefined : TokenCount.measured(usage.inputTokens);
	}

	/**
	 * The measurement carried forward to the prompt as it stands now, in tokens.
	 *
	 * It is derived from characters and is not a measurement, which is why it answers a
	 * number rather than a `TokenCount`. It exists for the decision that is better taken
	 * early and cheaply: a conversation that doubled since the last call is worth
	 * compacting before the call that would prove it.
	 */
	public get projectedTokens(): number | undefined {
		const usage = this.usage;
		return usage === undefined ? undefined : Math.round(usage.inputTokens * this.growth());
	}

	/** The projection as a share of the window, for a policy that reasons in percentages. */
	public get projectedUsedShare(): number | undefined {
		const projected = this.projectedTokens;
		if (projected === undefined || this.window.inputCapacity <= 0) return undefined;
		return projected / this.window.inputCapacity;
	}

	/** Room the projection leaves in the window; absent when either half of the answer is unknown. */
	public get projectedFreeTokens(): number | undefined {
		const projected = this.projectedTokens;
		if (projected === undefined || !this.isWindowKnown) return undefined;
		return Math.max(0, this.window.inputCapacity - projected);
	}

	/** Free room as a share of the window, between 0 and 1; absent for the same reasons. */
	public get projectedFreeShare(): number | undefined {
		const free = this.projectedFreeTokens;
		if (free === undefined || this.window.inputCapacity <= 0) return undefined;
		return Math.min(1, free / this.window.inputCapacity);
	}

	public get isExhausted(): boolean {
		return this.projectedFreeTokens === 0;
	}

	public get fits(): boolean {
		const projected = this.projectedTokens;
		if (projected === undefined) return true;
		return this.window.fits(projected);
	}

	/**
	 * Refuses a context a declared window will not hold.
	 *
	 * The number it refuses on is a projection, and it is refused anyway: paying for a call
	 * that a window cannot fit buys nothing, and the alternative to projecting is finding
	 * out from the provider after being charged. What it never does is invent one. An
	 * unknown window, or a session no provider has measured yet, goes through untouched.
	 */
	public verify(model: ModelIdentity): void {
		if (this.fits) return;
		throw new ContextBudgetExceededError(model.toString(), this.projectedTokens ?? 0, this.window.inputCapacity);
	}

	/**
	 * How the prompt changed in size since the measured call, as a factor.
	 * It scales both ways: a conversation that grew costs more than the measurement says,
	 * and one that was just compacted costs less, which is the whole point of compacting.
	 */
	private growth(): number {
		const measuredAt = this.measuredAtCharacters;
		if (measuredAt === undefined) return 1;
		const growth = this.composition.growthFrom(measuredAt);
		return Number.isFinite(growth) ? growth : 1;
	}
}
