/**
 * What a judge decided about one answer.
 *
 * The reason travels with the score because a failing assertion has to say something
 * useful: a bare 0.4 tells nobody what the answer was missing, and the judge is the only
 * one that knows.
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
