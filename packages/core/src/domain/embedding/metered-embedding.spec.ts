import { describe, expect, it } from "vitest";
import { ModelIdentity } from "../model/model-identity";
import { ModelUsage } from "../model/model-usage";
import { EmbeddingVector } from "./embedding-vector";
import { MeteredEmbedding } from "./metered-embedding";

const MODEL = ModelIdentity.of("openai", "text-embedding-3-small");

describe("MeteredEmbedding", () => {
	it("bills like any other call, so one reporter prices both", () => {
		const embedding = new MeteredEmbedding(EmbeddingVector.of([1, 0]), MODEL, ModelUsage.of(120, 0));

		expect(embedding.billed.model.toString()).toBe(MODEL.toString());
		expect(embedding.billed.usage.inputTokens).toBe(120);
	});

	it("keeps the vector it was built from", () => {
		expect(new MeteredEmbedding(EmbeddingVector.of([1, 0]), MODEL, ModelUsage.none()).vector.dimension).toBe(2);
	});
});
