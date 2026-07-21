import { GoogleGenAI } from "@google/genai";
import { Embedder, type EmbeddingResult } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";

/**
 * EXAMPLE Embedder implementation over @google/genai — the lib ships no default on purpose.
 * Copy and adapt: model, batching, caching, or a fully local embedder (the contract doesn't care).
 * Token statistics are only reported on Vertex (ContentEmbeddingStatistics) — 0 otherwise.
 */
@Injectable()
export class GeminiEmbedder extends Embedder {
	private readonly genai = new GoogleGenAI({
		apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENAI_API_KEY,
	});

	public async embed(texts: string[]): Promise<EmbeddingResult> {
		const response = await this.genai.models.embedContent({
			model: process.env.EMBEDDING_MODEL ?? "gemini-embedding-001",
			contents: texts,
		});

		const embeddings = response.embeddings ?? [];
		return {
			embeddings: embeddings.map((embedding) => embedding.values ?? []),
			usage: {
				promptTokens: embeddings.reduce((sum, embedding) => sum + (embedding.statistics?.tokenCount ?? 0), 0),
			},
		};
	}
}
