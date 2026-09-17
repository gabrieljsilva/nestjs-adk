import type { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import type { ModelUsage } from "../model/usage/model-usage.value-object";

export class BilledCall {
	public constructor(
		public readonly model: ModelIdentity,
		public readonly usage: ModelUsage,
	) {}
}
