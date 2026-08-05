import { AdkError } from "../../../common/errors/adk.error";

/**
 * A vector with no dimensions, or with a value that is not a number, was built.
 * It is refused where it is created rather than where it is compared, so the stack trace
 * points at the embedder that produced it instead of at the comparison that tripped.
 */
export class EmptyVectorError extends AdkError {
	public readonly code = "EMBEDDING_EMPTY_VECTOR";

	public constructor(public readonly reason: string) {
		super(`The embedding vector is unusable: ${reason}.`);
	}
}
