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
