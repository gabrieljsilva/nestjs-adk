import type { ContextWindow } from "../model/descriptor/context-window.value-object";
import type { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import type { PromptMeasurement } from "../model/usage/prompt-measurement.value-object";
import { TokenCount } from "../model/usage/token-count.value-object";
import { ContextBudgetExceededError } from "./errors/context-budget-exceeded.error";

/**
 * How much of the window is spoken for, and how much is still free.
 *
 * Every answer is absent unless the model declared a window and a call already reported usage;
 * absent rather than zero, which would read like room to spare. A `projected*` answer is a plain
 * number, because nobody measured it.
 */
export class ContextBudget {
	public constructor(
		public readonly window: ContextWindow,
		public readonly lastPrompt?: PromptMeasurement,
		public readonly characters: number = lastPrompt?.characters ?? 0,
	) {}

	public get isWindowKnown(): boolean {
		return this.window.isKnown;
	}

	public get isMeasured(): boolean {
		return this.lastPrompt !== undefined;
	}

	public get isKnown(): boolean {
		return this.isWindowKnown && this.isMeasured;
	}

	public get usedTokens(): TokenCount | undefined {
		const measured = this.lastPrompt;
		return measured === undefined ? undefined : TokenCount.measured(measured.usage.inputTokens);
	}

	public get projectedTokens(): number | undefined {
		const measured = this.lastPrompt;
		return measured === undefined ? undefined : Math.round(measured.usage.inputTokens * this.growth());
	}

	public get projectedUsedShare(): number | undefined {
		const projected = this.projectedTokens;
		if (projected === undefined || this.window.inputCapacity <= 0) return undefined;
		return projected / this.window.inputCapacity;
	}

	public get projectedFreeTokens(): number | undefined {
		const projected = this.projectedTokens;
		if (projected === undefined || !this.isWindowKnown) return undefined;
		return Math.max(0, this.window.inputCapacity - projected);
	}

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

	public verify(model: ModelIdentity): void {
		if (this.fits) return;
		throw new ContextBudgetExceededError(model.toString(), this.projectedTokens ?? 0, this.window.inputCapacity);
	}

	private growth(): number {
		const measured = this.lastPrompt?.characters ?? 0;
		return measured <= 0 ? 1 : this.characters / measured;
	}
}
