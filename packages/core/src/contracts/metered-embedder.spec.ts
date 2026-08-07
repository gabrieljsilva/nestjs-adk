import { describe, expect, it } from "vitest";
import { EmbeddingVector } from "../domain/embedding/embedding-vector";
import { MeteredEmbedding } from "../domain/embedding/metered-embedding";
import { ModelIdentity } from "../domain/model/model-identity";
import { ModelUsage } from "../domain/model/model-usage";
import { Embedder } from "./embedder";
import { MeteredEmbedder } from "./metered-embedder";

class CountingEmbedder extends MeteredEmbedder {
	public calls = 0;

	public async embedMetered(text: string): Promise<MeteredEmbedding> {
		this.calls += 1;
		return new MeteredEmbedding(
			EmbeddingVector.of([text.length]),
			ModelIdentity.of("acme", "embed-1"),
			ModelUsage.of(text.length, 0),
		);
	}
}

describe("MeteredEmbedder", () => {
	it("is an embedder, so it plugs in wherever one is expected", () => {
		expect(new CountingEmbedder()).toBeInstanceOf(Embedder);
	});

	/** The whole point of implementing `embed` here: nobody has to write it twice. */
	it("answers the plain contract from the metered one", async () => {
		const embedder = new CountingEmbedder();

		expect((await embedder.embed("four")).values).toEqual([4]);
		expect(embedder.calls).toBe(1);
	});
});
