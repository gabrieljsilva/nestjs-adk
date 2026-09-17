/**
 * What one model call consumed, as the provider reported it.
 * Cached input is counted apart from fresh input because it is billed apart, and
 * `reportsCaching` separates a provider that reported no caching from one that said nothing.
 */
export class ModelUsage {
	private constructor(
		public readonly inputTokens: number,
		public readonly outputTokens: number,
		public readonly cachedInputTokens: number,
		public readonly reportsCaching: boolean = true,
	) {}

	public static fromReport(inputTokens: number, outputTokens: number, cachedInputTokens?: number): ModelUsage {
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
