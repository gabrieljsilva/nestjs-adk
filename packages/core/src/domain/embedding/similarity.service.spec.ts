import { describe, expect, it } from "vitest";
import { EmbeddingVector } from "./embedding-vector.value-object";
import { IncompatibleVectorsError } from "./errors/incompatible-vectors.error";
import { Similarity } from "./similarity.service";

const similarity = new Similarity();

describe("Similarity", () => {
	it("scores one for the same direction", () => {
		expect(similarity.cosine(new EmbeddingVector([1, 0]), new EmbeddingVector([1, 0]))).toBe(1);
	});

	it("ignores length, because only direction carries meaning", () => {
		expect(similarity.cosine(new EmbeddingVector([1, 0]), new EmbeddingVector([10, 0]))).toBe(1);
	});

	it("scores zero for directions with nothing in common", () => {
		expect(similarity.cosine(new EmbeddingVector([1, 0]), new EmbeddingVector([0, 1]))).toBe(0);
	});

	it("scores minus one for opposite directions", () => {
		expect(similarity.cosine(new EmbeddingVector([1, 0]), new EmbeddingVector([-1, 0]))).toBe(-1);
	});

	it("refuses vectors of different dimensions, which are almost always different embedders", () => {
		expect(() => similarity.cosine(new EmbeddingVector([1, 0]), new EmbeddingVector([1, 0, 0]))).toThrow(
			IncompatibleVectorsError,
		);
	});

	it("answers zero for a vector that points nowhere, instead of dividing by nothing", () => {
		expect(similarity.cosine(new EmbeddingVector([0, 0]), new EmbeddingVector([1, 0]))).toBe(0);
	});
});
