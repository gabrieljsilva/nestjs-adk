import { AdkError } from "@nestjs-adk/core";

/**
 * The embedding call came back without a vector.
 *
 * It happens when the name is a generation model rather than an embedding one, or when
 * the text embedded to nothing. Either way the caller asked for a direction and got no
 * direction, and inventing a zero vector here would make every similarity that follows
 * score zero against everything, with nothing saying why.
 */
export class EmptyEmbeddingError extends AdkError {
	public readonly code = "GEMINI_EMPTY_EMBEDDING";

	public constructor(public readonly model: string) {
		super(
			`${model} answered without an embedding. Check that the name is an embedding model and that the text is not empty.`,
		);
	}
}
