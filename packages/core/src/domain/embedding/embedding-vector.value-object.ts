import { EmptyVectorError } from "./errors/empty-vector.error";

/**
 * What an embedder turned a text into, with the invariants a comparison depends on.
 *
 * A vector of no dimensions and a vector with a value that is not a number are both
 * refused here, because both produce a similarity that reads like a number and means
 * nothing. Everything downstream can then compare without checking.
 */
export class EmbeddingVector {
	public readonly values: readonly number[];

	public constructor(values: readonly number[]) {
		if (values.length === 0) throw new EmptyVectorError("it has no dimensions");
		if (values.some((value) => !Number.isFinite(value))) {
			throw new EmptyVectorError("it has a value that is not a finite number");
		}
		this.values = [...values];
	}

	public get dimension(): number {
		return this.values.length;
	}

	/** Zero for a vector that points nowhere, which is a direction nothing can be close to. */
	public get magnitude(): number {
		return Math.sqrt(this.values.reduce((total, value) => total + value * value, 0));
	}
}
