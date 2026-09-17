/**
 * What the judge answered: whether the answer passed, the score it was given, and the reasoning
 * behind it, which is what a failing assertion prints.
 */
export class JudgeVerdict {
	public readonly score: number;
	public readonly reason: string;

	public constructor(
		public readonly passed: boolean,
		score: number,
		reason: string,
	) {
		this.score = Math.min(1, Math.max(0, score));
		this.reason = reason.trim();
	}
}
