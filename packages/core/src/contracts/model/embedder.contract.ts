import type { EmbeddingVector } from "../../domain/embedding/embedding-vector.value-object";
import { MeteredEmbedding } from "../../domain/embedding/metered-embedding.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import { ModelUsage } from "../../domain/model/usage/model-usage.value-object";

const UNMETERED_PROVIDER = "embedder";

/**
 * Turns text into the vector something else will compare.
 *
 * Every vector one embedder produces has the same dimension, which is what makes the
 * comparison meaningful; mixing two embedders in one comparison is what the vector
 * invariants exist to catch.
 */
export abstract class Embedder {
	public abstract embed(text: string): Promise<EmbeddingVector>;

	/**
	 * The vector, plus the model and the usage the provider reported for producing it. The
	 * default reports no usage, which puts the call in `cost.unpriced`; override it when the
	 * provider reports one.
	 */
	public async embedMetered(text: string): Promise<MeteredEmbedding> {
		return new MeteredEmbedding(
			await this.embed(text),
			new ModelIdentity(UNMETERED_PROVIDER, this.constructor.name),
			ModelUsage.none(),
		);
	}
}
