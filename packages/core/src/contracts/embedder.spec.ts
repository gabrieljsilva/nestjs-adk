import { describe, expect, it } from "vitest";
import { EmbeddingVector } from "../domain/embedding/embedding-vector";
import { Embedder } from "./embedder";

/** One dimension per letter position, which is enough to prove the port is usable. */
class LengthEmbedder extends Embedder {
	public async embed(text: string): Promise<EmbeddingVector> {
		return EmbeddingVector.of([text.length, text.split(" ").length]);
	}
}

describe("Embedder", () => {
	it("turns a text into a vector", async () => {
		const vector = await new LengthEmbedder().embed("two words");

		expect(vector.dimension).toBe(2);
		expect(vector.values).toEqual([9, 2]);
	});

	it("is the type anything that compares embeddings depends on", () => {
		expect(new LengthEmbedder()).toBeInstanceOf(Embedder);
	});
});
