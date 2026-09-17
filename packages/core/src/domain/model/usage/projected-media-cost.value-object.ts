// The band the providers bill a small image in, and the usual characters-per-token ratio.
const TOKENS_PER_IMAGE = 258;
const CHARACTERS_PER_TOKEN = 4;

export class ProjectedMediaCost {
	private constructor(public readonly characters: number) {}

	public static ofImage(): ProjectedMediaCost {
		return ProjectedMediaCost.ofTokens(TOKENS_PER_IMAGE);
	}

	public static ofTokens(tokens: number): ProjectedMediaCost {
		return new ProjectedMediaCost(Math.max(0, Math.trunc(tokens)) * CHARACTERS_PER_TOKEN);
	}
}
