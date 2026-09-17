import { AdkError } from "../../../common/errors/adk.error";

/**
 * A vector with no dimensions, or with a value that is not a finite number, was built. Thrown
 * where the vector is created, so the trace points at the embedder that produced it.
 */
export class EmptyVectorError extends AdkError {
	public readonly code = "EMBEDDING_EMPTY_VECTOR";

	public constructor(public readonly reason: string) {
		super(`The embedding vector is unusable: ${reason}.`);
	}
}
