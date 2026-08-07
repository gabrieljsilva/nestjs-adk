import { BilledCall } from "../cost/billed-call";
import type { ModelIdentity } from "../model/model-identity";
import type { ModelUsage } from "../model/model-usage";
import type { EmbeddingVector } from "./embedding-vector";

/**
 * One embedding, and what the provider charged for it.
 *
 * It holds no money, the same way {@link BilledCall} holds none: what a token costs comes from a
 * source, and asking a source is I/O that has no business inside an embed call. The model is
 * carried because an application can hold two embedders, and a bill has to say which one ran.
 */
export class MeteredEmbedding {
	public constructor(
		public readonly vector: EmbeddingVector,
		public readonly model: ModelIdentity,
		public readonly usage: ModelUsage,
	) {}

	/** The same shape a model turn is billed as, so one reporter prices both. */
	public get billed(): BilledCall {
		return new BilledCall(this.model, this.usage);
	}
}
