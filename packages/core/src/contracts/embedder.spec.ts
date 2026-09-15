import { describe, expect, it } from "vitest";
import { EmbeddingVector } from "../domain/embedding/embedding-vector";
import { MeteredEmbedding } from "../domain/embedding/metered-embedding";
import { ModelIdentity } from "../domain/model/model-identity";
import { ModelUsage } from "../domain/model/model-usage";
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

	it("meters an embedder that cannot report, with a usage of nothing under its own name", async () => {
		const metered = await new LengthEmbedder().embedMetered("two words");

		expect(metered.vector.values).toEqual([9, 2]);
		expect(metered.model.equals(ModelIdentity.of("embedder", "LengthEmbedder"))).toBe(true);
		expect(metered.usage.totalTokens).toBe(0);
	});

	/** An override is how a provider that counts gets counted, and `embed` keeps working through it. */
	it("lets an embedder that reports usage override the default", async () => {
		class CountingEmbedder extends Embedder {
			public async embed(text: string): Promise<EmbeddingVector> {
				return (await this.embedMetered(text)).vector;
			}

			public async embedMetered(text: string): Promise<MeteredEmbedding> {
				return new MeteredEmbedding(
					EmbeddingVector.of([text.length]),
					ModelIdentity.of("acme", "embed-1"),
					ModelUsage.of(text.length, 0),
				);
			}
		}

		const embedder = new CountingEmbedder();

		expect((await embedder.embed("four")).values).toEqual([4]);
		expect((await embedder.embedMetered("four")).usage.inputTokens).toBe(4);
	});
});
