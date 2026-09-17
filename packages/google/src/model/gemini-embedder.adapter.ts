import type { EmbedContentConfig } from "@google/genai";
import { Embedder, EmbeddingVector } from "@nestjs-adk/core";
import { EmptyEmbeddingError } from "../errors/empty-embedding.error";
import type { GenAiEmbeddingClient } from "../transport/genai-client.contract";
import { GenAiClientFactory } from "../transport/genai-client.factory";
import type { GeminiOptions } from "./gemini.options";

const DEFAULT_MODEL = "gemini-embedding-2";

/**
 * What `GeminiEmbedder` takes on top of `GeminiOptions`: the vector length to ask for, and the
 * task the embedding is for, which Gemini uses to tune the vectors it returns.
 */
export interface GeminiEmbeddingOptions extends GeminiOptions {
	outputDimensionality?: number;

	taskType?: string;
}

/**
 * Google's embedding models as an `Embedder`. Construct it and hand it to the module, or wrap
 * it to price it.
 *
 * An answer carrying no vector raises `EmptyEmbeddingError`, which is what a name that is not
 * an embedding model, or empty text, looks like from here.
 */
export class GeminiEmbedder extends Embedder {
	private readonly client: GenAiEmbeddingClient;

	public constructor(
		public readonly model: string = DEFAULT_MODEL,
		private readonly options: GeminiEmbeddingOptions = {},
		client?: GenAiEmbeddingClient,
	) {
		super();
		this.client = client ?? new GenAiClientFactory().embeddings(options);
	}

	public async embed(text: string): Promise<EmbeddingVector> {
		const response = await this.client.models.embedContent({
			model: this.model,
			contents: text,
			config: this.buildConfig(),
		});
		const values = response.embeddings?.[0]?.values;
		if (values === undefined || values.length === 0) throw new EmptyEmbeddingError(this.model);
		return new EmbeddingVector(values);
	}

	private buildConfig(): EmbedContentConfig {
		return { taskType: this.options.taskType, outputDimensionality: this.options.outputDimensionality };
	}
}
