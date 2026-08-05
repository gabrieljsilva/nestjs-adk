import { describe, expect, it } from "vitest";
import { EmbeddingVector } from "./embedding-vector";
import { EmptyVectorError } from "./errors/empty-vector.error";

describe("EmbeddingVector", () => {
	it("carries the values and knows how many there are", () => {
		const vector = EmbeddingVector.of([1, 0, 0]);

		expect(vector.dimension).toBe(3);
		expect(vector.values).toEqual([1, 0, 0]);
	});

	it("refuses a vector of no dimensions", () => {
		expect(() => EmbeddingVector.of([])).toThrow(EmptyVectorError);
	});

	it("refuses a value that is not a finite number", () => {
		expect(() => EmbeddingVector.of([1, Number.NaN])).toThrow(EmptyVectorError);
		expect(() => EmbeddingVector.of([1, Number.POSITIVE_INFINITY])).toThrow(EmptyVectorError);
	});

	it("measures its own length, and answers zero for one that points nowhere", () => {
		expect(EmbeddingVector.of([3, 4]).magnitude).toBe(5);
		expect(EmbeddingVector.of([0, 0]).magnitude).toBe(0);
	});

	it("copies the values, so an embedder cannot change one after handing it over", () => {
		const values = [1, 2];
		const vector = EmbeddingVector.of(values);

		values[0] = 99;

		expect(vector.values[0]).toBe(1);
	});
});
