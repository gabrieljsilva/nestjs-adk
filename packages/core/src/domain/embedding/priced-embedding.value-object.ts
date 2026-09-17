import type { RunCost } from "../cost/run-cost.value-object";
import type { EmbeddingVector } from "./embedding-vector.value-object";

export class PricedEmbedding {
	public constructor(
		public readonly vector: EmbeddingVector,
		public readonly cost: RunCost,
	) {}
}
