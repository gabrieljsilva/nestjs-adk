import type { RunCost } from "../cost/run-cost";
import type { EmbeddingVector } from "./embedding-vector";

/**
 * An embedding and what it cost, which for most providers is a cost nobody could measure.
 *
 * `cost.isComplete` is what says which of the two happened. A zero from an embedder that
 * reports no usage and a zero from a free model read identically otherwise, and only one of
 * them means the invoice will agree.
 */
export class PricedEmbedding {
	public constructor(
		public readonly vector: EmbeddingVector,
		public readonly cost: RunCost,
	) {}
}
