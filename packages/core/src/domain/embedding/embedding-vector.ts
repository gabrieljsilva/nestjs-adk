import { EmptyVectorError } from "./errors/empty-vector.error";

/**
 * What an embedder turned a text into, with the invariants a comparison depends on.
 *
 * A vector of no dimensions and a vector with a value that is not a number are both
 * refused here, because both produce a similarity that reads like a number and means
 * nothing. Everything downstream can then compare without checking.
 */
export class EmbeddingVector {
	private constructor(public readonly values: readonly number[]) {}

	public static of(values: readonly number[]): EmbeddingVector {
		if (values.length === 0) throw new EmptyVectorError("it has no dimensions");
		if (values.some((value) => !Number.isFinite(value))) {
			throw new EmptyVectorError("it has a value that is not a finite number");
		}
		return new EmbeddingVector([...values]);
	}

	public get dimension(): number {
		return this.values.length;
	}

	/** Zero for a vector that points nowhere, which is a direction nothing can be close to. */
	public get magnitude(): number {
		return Math.sqrt(this.values.reduce((total, value) => total + value * value, 0));
	}
}
