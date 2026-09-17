import { AdkError } from "../../../common/errors/adk.error";

/**
 * Two vectors of different dimensions were compared, which almost always means two different
 * embedders. The number a comparison would answer there looks like a similarity and is not one.
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
