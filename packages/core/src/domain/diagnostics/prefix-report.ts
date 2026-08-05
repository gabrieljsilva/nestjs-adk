import type { PrefixDivergence } from "./prefix-divergence";

/**
 * How much of two or more contexts is the same opening, and where it stops being so.
 *
 * The ratio is measured against the **largest** context compared, not the smallest. A
 * provider side cache is paid for by the longer run, so the worst case is the number worth
 * reporting: saying 100% because the shorter context happened to be a prefix of the longer
 * one would hide exactly the cost this exists to show.
 */
export class PrefixReport {
	public constructor(
		public readonly prefixCharacters: number,
		public readonly totalCharacters: number,
		public readonly divergence?: PrefixDivergence,
	) {}

	public get ratio(): number {
		return this.totalCharacters === 0 ? 1 : this.prefixCharacters / this.totalCharacters;
	}

	/** True when every context compared was byte identical. */
	public get isIdentical(): boolean {
		return this.divergence === undefined;
	}
}
