import type { EmbedContentConfig } from "@google/genai";
import { Embedder, EmbeddingVector } from "@nestjs-adk/core";
import { EmptyEmbeddingError } from "./errors/empty-embedding.error";
import type { GeminiOptions } from "./gemini-options";
import type { GenAiEmbeddingClient } from "./genai-client";
import { GenAiClientFactory } from "./genai-client-factory";

/** The current embedding model, for a caller who has no reason to pick one. */
const DEFAULT_MODEL = "gemini-embedding-2";

/**
 * How to reach the embedding API, plus what only an embedding call takes.
 *
 * It extends the generation options because reaching Gemini is the same problem in both
 * cases: an API key, or Vertex AI with a project and a location. The fields a generation
 * call takes and an embedding call does not (`temperature`, `maxOutputTokens`) are simply
 * not read here.
 */
export interface GeminiEmbeddingOptions extends GeminiOptions {
	/**
	 * Cuts the vector down to this many dimensions.
	 *
	 * Newer models return a long vector and let the caller truncate it. Shorter vectors
	 * cost less to store and compare, and every vector in one comparison has to have been
	 * asked for at the same length.
	 */
	outputDimensionality?: number;

	/**
	 * What the vector is for, for example `SEMANTIC_SIMILARITY` or `RETRIEVAL_DOCUMENT`.
	 *
	 * The same text embeds differently depending on the answer, so two vectors compared
	 * against each other have to have been produced under the same task.
	 */
	taskType?: string;
}

/**
 * Turns text into a vector using Google's embedding models.
 *
 * ```ts
 * const embedder = new GeminiEmbedder("gemini-embedding-2", {
 *     apiKey: process.env.GEMINI_API_KEY,
 *     taskType: "SEMANTIC_SIMILARITY",
 * });
 * const similarity = new Similarity().cosine(await embedder.embed(one), await embedder.embed(other));
 * ```
 *
 * One text per call, because that is what the port asks for. Google accepts a batch, and
 * a caller with a corpus to index wants the batch; that belongs to whatever indexes a
 * corpus, not to a port whose whole contract is one text to one vector.
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
			config: this.configOf(),
		});
		const values = response.embeddings?.[0]?.values;
		if (values === undefined || values.length === 0) throw new EmptyEmbeddingError(this.model);
		return EmbeddingVector.of(values);
	}

	private configOf(): EmbedContentConfig {
		return { taskType: this.options.taskType, outputDimensionality: this.options.outputDimensionality };
	}
}
