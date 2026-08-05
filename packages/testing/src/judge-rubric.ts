/** Where a score stops being a pass, when the caller did not say. */
const DEFAULT_THRESHOLD = 0.7;

/**
 * What an answer is being judged against, and how good is good enough.
 *
 * The criteria are written for a model to read, so they say what a correct answer
 * contains rather than what it looks like: "names the order id and says it shipped"
 * survives a rewording, "equals 'order 42 shipped'" does not, and an assertion that
 * breaks on rewording is an assertion nobody keeps.
 */
export class JudgeRubric {
	private constructor(
		public readonly criteria: string,
		public readonly threshold: number,
	) {}

	public static of(criteria: string, threshold: number = DEFAULT_THRESHOLD): JudgeRubric {
		return new JudgeRubric(criteria.trim(), Math.min(1, Math.max(0, threshold)));
	}

	public passes(score: number): boolean {
		return score >= this.threshold;
	}
}
