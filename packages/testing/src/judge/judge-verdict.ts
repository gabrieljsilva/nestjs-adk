/**
 * What a judge decided about one answer.
 *
 * The reason travels with the score because a failing assertion has to say something
 * useful: a bare 0.4 tells nobody what the answer was missing, and the judge is the only
 * one that knows.
 */
export class JudgeVerdict {
	private constructor(
		public readonly passed: boolean,
		public readonly score: number,
		public readonly reason: string,
	) {}

	public static of(passed: boolean, score: number, reason: string): JudgeVerdict {
		return new JudgeVerdict(passed, Math.min(1, Math.max(0, score)), reason.trim());
	}
}
