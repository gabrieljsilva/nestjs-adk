import { AdkError } from "@nestjs-adk/core";

/**
 * Raised when Gemini answers an embedding request with no vector, which is what a model name
 * that does not embed, or empty text, looks like from here.
 */
export class EmptyEmbeddingError extends AdkError {
	public readonly code = "GEMINI_EMPTY_EMBEDDING";

	public constructor(public readonly model: string) {
		super(
			`${model} answered without an embedding. Check that the name is an embedding model and that the text is not empty.`,
		);
	}
}
