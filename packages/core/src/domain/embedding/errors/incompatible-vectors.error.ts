import { AdkError } from "../../../common/errors/adk.error";

/**
 * Two vectors that cannot be compared were compared.
 * Different dimensions almost always mean different embedders, or the same embedder at
 * two configurations, and the number a comparison would return in that case looks like a
 * similarity while meaning nothing.
 */
export class IncompatibleVectorsError extends AdkError {
	public readonly code = "EMBEDDING_INCOMPATIBLE_VECTORS";

	public constructor(
		public readonly left: number,
		public readonly right: number,
	) {
		super(`Vectors of ${left} and ${right} dimensions cannot be compared.`);
	}
}
