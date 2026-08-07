import type { EmbeddingVector } from "../domain/embedding/embedding-vector";
import type { MeteredEmbedding } from "../domain/embedding/metered-embedding";
import { Embedder } from "./embedder";

/**
 * An embedder that also says what the call consumed.
 *
 * It exists apart from {@link Embedder} because most providers cannot answer this. Google's
 * `embedContent` returns a `billableCharacterCount` and only on Enterprise, and nothing there
 * counts tokens, so `GeminiEmbedder` is an `Embedder` and not this. Extend this one when the
 * provider reports usage, and the cost of an embedding becomes a number somebody measured
 * rather than a number somebody estimated from characters.
 *
 * `embed` is implemented here, so a caller that only wants the vector never has to know which
 * of the two it was handed.
 */
export abstract class MeteredEmbedder extends Embedder {
	/** The vector, plus the model and the usage the provider reported for producing it. */
	public abstract embedMetered(text: string): Promise<MeteredEmbedding>;

	public async embed(text: string): Promise<EmbeddingVector> {
		return (await this.embedMetered(text)).vector;
	}
}
