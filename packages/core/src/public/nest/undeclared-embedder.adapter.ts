import { Embedder } from "../../contracts/model/embedder.contract";
import type { EmbeddingVector } from "../../domain/embedding/embedding-vector.value-object";
import { EmbedderNotDeclaredError } from "./errors/embedder-not-declared.error";

export class UndeclaredEmbedder extends Embedder {
	public async embed(): Promise<EmbeddingVector> {
		throw new EmbedderNotDeclaredError();
	}
}
