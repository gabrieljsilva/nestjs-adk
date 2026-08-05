/**
 * What one model call consumed, as the provider reported it.
 *
 * Cached input is counted apart from fresh input because it is billed apart: a
 * conversation whose stable prefix was cached costs a fraction of the same
 * conversation sent cold, and folding the two together hides exactly that.
 *
 * A provider that said nothing about caching is not a provider reporting zero, and the two
 * read identically once a default has been applied. `reportsCaching` keeps them apart, so a
 * diagnostic can say "unknown" instead of accusing an agent of a cache that never engaged.
 */
export class ModelUsage {
	private constructor(
		public readonly inputTokens: number,
		public readonly outputTokens: number,
		public readonly cachedInputTokens: number,
		/** False when nobody reported caching at all, which is not the same as reporting none. */
		public readonly reportsCaching: boolean = true,
	) {}

	public static of(inputTokens: number, outputTokens: number, cachedInputTokens?: number): ModelUsage {
		const input = Math.max(0, Math.trunc(inputTokens));
		return new ModelUsage(
			input,
			Math.max(0, Math.trunc(outputTokens)),
			Math.min(input, Math.max(0, Math.trunc(cachedInputTokens ?? 0))),
			cachedInputTokens !== undefined,
		);
	}

	public static none(): ModelUsage {
		return new ModelUsage(0, 0, 0, false);
	}

	public get totalTokens(): number {
		return this.inputTokens + this.outputTokens;
	}

	/** Input the provider had to read anew, which is what a cache is meant to shrink. */
	public get freshInputTokens(): number {
		return this.inputTokens - this.cachedInputTokens;
	}

	public plus(other: ModelUsage): ModelUsage {
		return new ModelUsage(
			this.inputTokens + other.inputTokens,
			this.outputTokens + other.outputTokens,
			this.cachedInputTokens + other.cachedInputTokens,
			this.reportsCaching || other.reportsCaching,
		);
	}
}
