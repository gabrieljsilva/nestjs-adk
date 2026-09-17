/**
 * How much of a sequence of prompts a provider said it served from cache.
 *
 * `available` is the field that matters most: a provider that says nothing about cached
 * tokens is not a provider reporting zero. Reporting 0% there would send somebody hunting
 * a caching bug that does not exist, so a silent run leaves the sample entirely, numerator
 * and denominator both.
 */
export class CacheReport {
	public constructor(
		public readonly cachedTokens: number,
		public readonly promptTokens: number,
		public readonly sampledRuns: number,
		public readonly silentRuns: number,
	) {}

	public static unavailable(silentRuns: number): CacheReport {
		return new CacheReport(0, 0, 0, silentRuns);
	}

	public get available(): boolean {
		return this.sampledRuns > 0;
	}

	public get ratio(): number {
		return this.promptTokens === 0 ? 0 : this.cachedTokens / this.promptTokens;
	}
}
