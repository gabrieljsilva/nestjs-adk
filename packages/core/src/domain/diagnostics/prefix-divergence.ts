/** Where two contexts stopped being the same string, and what came right after. */
export class PrefixDivergence {
	public constructor(
		public readonly segment: string,
		public readonly offset: number,
		public readonly segmentOffset: number,
		public readonly excerpts: readonly string[],
	) {}
}
