import type { EmbeddingVector } from "./embedding-vector";
import { IncompatibleVectorsError } from "./errors/incompatible-vectors.error";

/**
 * How close two embeddings are, as the cosine of the angle between them.
 *
 * Cosine and not distance: embedders produce vectors whose length carries no meaning,
 * only their direction does, and a magnitude aware measure would call a long text and a
 * short one different for being long and short.
 *
 * A vector that points nowhere scores zero against everything. That is not a similarity,
 * it is the absence of one, and it is the only honest answer for a direction that does
 * not exist.
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
