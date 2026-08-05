/** An exported declaration, and where it appears. */
export class SourceSymbol {
	public constructor(
		public readonly name: string,
		public readonly line: number,
	) {}
}
