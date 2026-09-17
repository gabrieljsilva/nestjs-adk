import { EmptyVectorError } from "./errors/empty-vector.error";

/**
 * What an embedder turned a text into. A vector of no dimensions, or one holding a value that
 * is not a finite number, is refused here, so a comparison downstream needs no checks.
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

	public get magnitude(): number {
		return Math.sqrt(this.values.reduce((total, value) => total + value * value, 0));
	}
}
