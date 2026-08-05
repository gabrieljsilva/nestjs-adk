import type { ContextCategory } from "./context-category";

/**
 * How much of the prompt one category takes up, as a share of the whole.
 *
 * The size is in characters of the canonical text, and the field is named after what it
 * is: a character is not a token, and pretending otherwise is what turns a diagnostic
 * into a wrong budget. The share is the number worth reading, because the bias of the
 * proxy largely cancels out in a ratio between categories of the same prompt.
 */
export class ContextCompositionEntry {
	public constructor(
		public readonly category: ContextCategory,
		public readonly characters: number,
		public readonly share: number,
	) {}

	/** The share as a percentage, rounded to one decimal, for anything a person reads. */
	public get percentage(): number {
		return Math.round(this.share * 1000) / 10;
	}
}
