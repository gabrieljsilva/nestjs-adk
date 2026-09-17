export class PrefixDivergence {
	public constructor(
		public readonly segment: string,
		public readonly offset: number,
		public readonly segmentOffset: number,
		public readonly excerpts: readonly string[],
	) {}
}
