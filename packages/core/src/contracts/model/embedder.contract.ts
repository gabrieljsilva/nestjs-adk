import type { EmbeddingVector } from "../../domain/embedding/embedding-vector.value-object";
import { MeteredEmbedding } from "../../domain/embedding/metered-embedding.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import { ModelUsage } from "../../domain/model/usage/model-usage.value-object";

/** What an embedder nobody could meter is called in a bill, since it has no model identity. */
const UNMETERED_PROVIDER = "embedder";

/**
 * Turns text into the vector something else will compare.
 *
 * It is a port and not a service: the runtime never embeds anything on its own, and what
 * plugs in here is a provider call, a local model or, in a test, something deterministic.
 * Every vector one embedder produces has the same dimension, which is what makes the
 * comparison meaningful; mixing two embedders in one comparison is what the vector
 * invariants exist to catch.
 */
export abstract class Embedder {
	public abstract embed(text: string): Promise<EmbeddingVector>;

	/**
	 * The vector, plus the model and the usage the provider reported for producing it.
	 *
	 * Most providers cannot answer this: Google's `embedContent` returns a
	 * `billableCharacterCount` and only on Enterprise, and nothing there counts tokens. So the
	 * default reports a usage of nothing under an identity derived from the class that ran, which
	 * is what puts the call in `cost.unpriced` rather than under a number somebody estimated.
	 * Override it when the provider reports usage, and `embed` keeps working through it.
	 */
	public async embedMetered(text: string): Promise<MeteredEmbedding> {
		return new MeteredEmbedding(
			await this.embed(text),
			ModelIdentity.of(UNMETERED_PROVIDER, this.constructor.name),
			ModelUsage.none(),
		);
	}
}
