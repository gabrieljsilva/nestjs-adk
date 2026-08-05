import { GoogleGenAI } from "@google/genai";
import { AdkEmbedder, Embedder, type EmbeddingOutput } from "@nestjs-adk/core";

/**
 * EXAMPLE AdkEmbedder implementation over @google/genai; the lib ships no default on purpose.
 * Copy and adapt: model, batching, caching, or a fully local embedder (the contract doesn't care).
 * Token statistics are only reported on Vertex (ContentEmbeddingStatistics), absent otherwise,
 * and an absent count means the call goes unpriced instead of being counted as free.
 */
const MODEL = "gemini-embedding-001";

@Embedder({ model: MODEL, dimensions: 3072 })
export class GeminiEmbedder extends AdkEmbedder {
	private readonly genai = new GoogleGenAI({
		apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENAI_API_KEY,
	});

	protected async generate(texts: string[]): Promise<EmbeddingOutput> {
		const response = await this.genai.models.embedContent({
			model: MODEL,
			contents: texts,
			// what the decorator declares is what the provider gets: no second source of truth
			config: { outputDimensionality: this.dimensions },
		});

		const embeddings = response.embeddings ?? [];
		const reported = embeddings.filter((embedding) => embedding.statistics?.tokenCount != null);
		return {
			embeddings: embeddings.map((embedding) => embedding.values ?? []),
			usage: {
				promptTokens:
					reported.length > 0
						? reported.reduce((sum, embedding) => sum + (embedding.statistics?.tokenCount ?? 0), 0)
						: undefined,
			},
		};
	}
}
