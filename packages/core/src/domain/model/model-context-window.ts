import { ContextWindow } from "./context-window";

/**
 * A window the provider declared, in tokens.
 * A window that would leave no room reports zero available rather than a negative
 * budget, so a caller never subtracts its way into an impossible request.
 */
export class ModelContextWindow extends ContextWindow {
	public readonly isKnown = true;

	private constructor(
		public readonly totalTokens: number,
		public readonly reservedOutputTokens: number,
	) {
		super();
	}

	public static of(totalTokens: number, reservedOutputTokens: number): ModelContextWindow {
		const total = Math.max(0, Math.trunc(totalTokens));
		const reserved = Math.min(total, Math.max(0, Math.trunc(reservedOutputTokens)));
		return new ModelContextWindow(total, reserved);
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
