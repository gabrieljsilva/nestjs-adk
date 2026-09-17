import { describe, expect, it } from "vitest";
import { EmbeddingVector } from "./embedding-vector.value-object";
import { EmptyVectorError } from "./errors/empty-vector.error";

describe("EmbeddingVector", () => {
	it("carries the values and knows how many there are", () => {
		const vector = new EmbeddingVector([1, 0, 0]);

		expect(vector.dimension).toBe(3);
		expect(vector.values).toEqual([1, 0, 0]);
	});

	it("refuses a vector of no dimensions", () => {
		expect(() => new EmbeddingVector([])).toThrow(EmptyVectorError);
	});

	it("refuses a value that is not a finite number", () => {
		expect(() => new EmbeddingVector([1, Number.NaN])).toThrow(EmptyVectorError);
		expect(() => new EmbeddingVector([1, Number.POSITIVE_INFINITY])).toThrow(EmptyVectorError);
	});

	it("measures its own length, and answers zero for one that points nowhere", () => {
		expect(new EmbeddingVector([3, 4]).magnitude).toBe(5);
		expect(new EmbeddingVector([0, 0]).magnitude).toBe(0);
	});

	it("copies the values, so an embedder cannot change one after handing it over", () => {
		const values = [1, 2];
		const vector = new EmbeddingVector(values);

		values[0] = 99;

		expect(vector.values[0]).toBe(1);
	});
});
