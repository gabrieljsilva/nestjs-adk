import { ContextWindow } from "./context-window";

/**
 * The window of a model that never declared one.
 *
 * Everything fits, because refusing content against a limit nobody stated would be
 * inventing the limit. Measurement per category still happens, and the runtime reports
 * the unknown window once per model instead of guessing a number.
 */
export class UnknownContextWindow extends ContextWindow {
	public readonly isKnown = false;
	public readonly reservedOutputTokens = 0;
	public readonly inputCapacity = Number.POSITIVE_INFINITY;

	public fits(_inputTokens: number): boolean {
		return true;
	}
}
