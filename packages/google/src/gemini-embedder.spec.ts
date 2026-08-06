import type { EmbedContentParameters, EmbedContentResponse } from "@google/genai";
import { Similarity } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { EmptyEmbeddingError } from "./errors/empty-embedding.error";
import { GeminiEmbedder } from "./gemini-embedder";
import type { GenAiEmbeddingClient } from "./genai-client";

/** Records what was asked for and answers whatever the spec handed it. */
class RecordingClient implements GenAiEmbeddingClient {
	public asked?: EmbedContentParameters;

	public constructor(private readonly response: EmbedContentResponse) {}

	public readonly models = {
		embedContent: async (params: EmbedContentParameters): Promise<EmbedContentResponse> => {
			this.asked = params;
			return this.response;
		},
	};
}

function clientAnswering(values: readonly number[]): RecordingClient {
	return new RecordingClient({ embeddings: [{ values: [...values] }] });
}

describe("GeminiEmbedder", () => {
	it("turns the answered floats into a vector", async () => {
		const embedder = new GeminiEmbedder("gemini-embedding-2", {}, clientAnswering([0.1, 0.2, 0.3]));

		const vector = await embedder.embed("a text");

		expect(vector.values).toEqual([0.1, 0.2, 0.3]);
		expect(vector.dimension).toBe(3);
	});

	it("asks the model it was named with, for the text it was given", async () => {
		const client = clientAnswering([1, 0]);

		await new GeminiEmbedder("gemini-embedding-2", {}, client).embed("a text");

		expect(client.asked?.model).toBe("gemini-embedding-2");
		expect(client.asked?.contents).toBe("a text");
	});

	it("passes the task and the dimension the caller declared", async () => {
		const client = clientAnswering([1, 0]);
		const options = { taskType: "SEMANTIC_SIMILARITY", outputDimensionality: 256 };

		await new GeminiEmbedder("gemini-embedding-2", options, client).embed("a text");

		expect(client.asked?.config).toMatchObject(options);
	});

	it("names an embedding model without being told", async () => {
		const client = clientAnswering([1, 0]);

		await new GeminiEmbedder(undefined, {}, client).embed("a text");

		expect(client.asked?.model).toBe("gemini-embedding-2");
	});

	it("fails with the model named when the answer carries no embedding", async () => {
		const embedder = new GeminiEmbedder("gemini-embedding-2", {}, new RecordingClient({}));

		await expect(embedder.embed("a text")).rejects.toBeInstanceOf(EmptyEmbeddingError);
	});

	it("fails when the answer carries an embedding with no values", async () => {
		const embedder = new GeminiEmbedder("gemini-embedding-2", {}, new RecordingClient({ embeddings: [{ values: [] }] }));

		await expect(embedder.embed("a text")).rejects.toBeInstanceOf(EmptyEmbeddingError);
	});

	it("produces vectors a similarity can compare", async () => {
		const close = await new GeminiEmbedder("gemini-embedding-2", {}, clientAnswering([1, 0.9, 0])).embed("one");
		const same = await new GeminiEmbedder("gemini-embedding-2", {}, clientAnswering([1, 1, 0])).embed("other");
		const apart = await new GeminiEmbedder("gemini-embedding-2", {}, clientAnswering([0, 0, 1])).embed("unrelated");
		const similarity = new Similarity();

		expect(similarity.cosine(close, same)).toBeGreaterThan(similarity.cosine(close, apart));
	});
});
