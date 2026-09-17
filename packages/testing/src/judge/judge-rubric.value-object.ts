const DEFAULT_THRESHOLD = 0.7;

/**
 * What an answer is graded against: the criteria it has to meet and the score below which the
 * judgement fails.
 */
export class JudgeRubric {
	public readonly criteria: string;
	public readonly threshold: number;

	public constructor(criteria: string, threshold: number = DEFAULT_THRESHOLD) {
		this.criteria = criteria.trim();
		this.threshold = Math.min(1, Math.max(0, threshold));
	}

	public passes(score: number): boolean {
		return score >= this.threshold;
	}
}
