import { ContextWindow } from "./context-window.value-object";

/**
 * A window the provider declared, in tokens.
 * A window with no room left reports zero available rather than a negative budget.
 */
export class ModelContextWindow extends ContextWindow {
	public readonly isKnown = true;

	public readonly totalTokens: number;
	public readonly reservedOutputTokens: number;

	public constructor(totalTokens: number, reservedOutputTokens: number) {
		super();
		const total = Math.max(0, Math.trunc(totalTokens));
		this.totalTokens = total;
		this.reservedOutputTokens = Math.min(total, Math.max(0, Math.trunc(reservedOutputTokens)));
	}

	public get inputTokens(): number {
		return this.totalTokens - this.reservedOutputTokens;
	}

	public get inputCapacity(): number {
		return this.inputTokens;
	}

	public available(usedTokens: number): number {
		return Math.max(0, this.inputTokens - Math.max(0, usedTokens));
	}

	public fits(usedTokens: number): boolean {
		return usedTokens <= this.inputTokens;
	}
}
