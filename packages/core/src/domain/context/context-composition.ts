import type { ModelUsage } from "../model/model-usage";
import { TokenCount } from "../model/token-count";
import type { ContextCategory } from "./context-category";
import { ContextCompositionEntry } from "./context-composition-entry";

/**
 * What the prompt is made of, category by category, before anyone calls the model.
 *
 * It answers proportion and never size. Nothing here claims to know how many tokens a
 * prompt will cost, because only the provider knows that and only after the call. What
 * it does answer is the question a caller actually has before the call: which part of
 * the context is taking up the room.
 */
export class ContextComposition {
	private constructor(
		public readonly entries: readonly ContextCompositionEntry[],
		public readonly characters: number,
	) {}

	public static of(sizes: ReadonlyArray<readonly [ContextCategory, number]>): ContextComposition {
		const measured = sizes.map(([category, characters]): readonly [ContextCategory, number] => [
			category,
			Math.max(0, Math.trunc(characters)),
		]);
		const total = measured.reduce((sum, [, characters]) => sum + characters, 0);
		const entries = measured.map(
			([category, characters]) => new ContextCompositionEntry(category, characters, total === 0 ? 0 : characters / total),
		);
		return new ContextComposition(entries, total);
	}

	public static empty(): ContextComposition {
		return new ContextComposition([], 0);
	}

	public get isEmpty(): boolean {
		return this.characters === 0;
	}

	public shareOf(category: ContextCategory): number {
		return this.entryOf(category)?.share ?? 0;
	}

	public charactersOf(category: ContextCategory): number {
		return this.entryOf(category)?.characters ?? 0;
	}

	/**
	 * Splits a measured input usage across the categories, by share.
	 *
	 * This is attribution and not measurement: the total is a number the provider
	 * reported, and the split is this composition's proportion applied to it. Without a
	 * measured usage there is nothing to attribute, and the answer is zero for every
	 * category rather than a plausible looking guess.
	 */
	public attribute(usage: ModelUsage): ReadonlyMap<ContextCategory, TokenCount> {
		const attributed = new Map<ContextCategory, TokenCount>();
		for (const entry of this.entries) {
			attributed.set(entry.category, TokenCount.measured(Math.round(entry.share * usage.inputTokens)));
		}
		return attributed;
	}

	/** How much the prompt grew since it was this size, as a factor. */
	public growthFrom(characters: number): number {
		if (characters <= 0) return this.characters === 0 ? 1 : Number.POSITIVE_INFINITY;
		return this.characters / characters;
	}

	private entryOf(category: ContextCategory): ContextCompositionEntry | undefined {
		return this.entries.find((entry) => entry.category.equals(category));
	}
}
