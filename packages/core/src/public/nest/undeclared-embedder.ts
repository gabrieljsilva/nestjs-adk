import { Embedder } from "../../contracts/embedder";
import type { EmbeddingVector } from "../../domain/embedding/embedding-vector";
import { EmbedderNotDeclaredError } from "./errors/embedder-not-declared.error";

/**
 * What the `Embedder` token resolves to when the application declared none.
 *
 * The provider exists either way on purpose. Leaving the token unregistered would make NestJS
 * refuse to build any service that injects an `Embedder`, at boot, with a message about a
 * missing dependency rather than a missing option. This way the injection succeeds, nothing
 * happens until somebody embeds, and then the failure names what to declare.
 */
export class UndeclaredEmbedder extends Embedder {
	public async embed(): Promise<EmbeddingVector> {
		throw new EmbedderNotDeclaredError();
	}
}
