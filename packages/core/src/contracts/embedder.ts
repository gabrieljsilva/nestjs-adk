import type { EmbeddingVector } from "../domain/embedding/embedding-vector";

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
}
