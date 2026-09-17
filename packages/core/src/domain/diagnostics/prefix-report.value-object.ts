import type { PrefixDivergence } from "./prefix-divergence.value-object";

export class PrefixReport {
	public constructor(
		public readonly prefixCharacters: number,
		public readonly totalCharacters: number,
		public readonly divergence?: PrefixDivergence,
	) {}

	public get ratio(): number {
		return this.totalCharacters === 0 ? 1 : this.prefixCharacters / this.totalCharacters;
	}

	public get isIdentical(): boolean {
		return this.divergence === undefined;
	}
}
