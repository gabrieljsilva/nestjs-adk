import type { EmbeddingVector } from "./embedding-vector.value-object";
import { IncompatibleVectorsError } from "./errors/incompatible-vectors.error";

/**
 * How close two embeddings are, as the cosine of the angle between them. A vector that points
 * nowhere scores zero against everything, and vectors of different dimensions are refused.
 */
export class Similarity {
	public cosine(left: EmbeddingVector, right: EmbeddingVector): number {
		if (left.dimension !== right.dimension) {
			throw new IncompatibleVectorsError(left.dimension, right.dimension);
		}
		const magnitudes = left.magnitude * right.magnitude;
		if (magnitudes === 0) return 0;

		let product = 0;
		for (let index = 0; index < left.dimension; index += 1) {
			product += (left.values[index] ?? 0) * (right.values[index] ?? 0);
		}
		return product / magnitudes;
	}
}
