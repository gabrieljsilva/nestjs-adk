import { BilledCall } from "../cost/billed-call.value-object";
import type { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import type { ModelUsage } from "../model/usage/model-usage.value-object";
import type { EmbeddingVector } from "./embedding-vector.value-object";

/**
 * One embedding and the tokens the provider reported for it. It holds no money: pricing is I/O
 * and happens once, afterwards, off the embed call.
 */
export class MeteredEmbedding {
	public constructor(
		public readonly vector: EmbeddingVector,
		public readonly model: ModelIdentity,
		public readonly usage: ModelUsage,
	) {}

	public get billed(): BilledCall {
		return new BilledCall(this.model, this.usage);
	}
}
