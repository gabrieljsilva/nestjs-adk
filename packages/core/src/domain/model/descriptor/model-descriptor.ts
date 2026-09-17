import type { ContextWindow } from "./context-window";
import type { ModelCapabilities } from "./model-capabilities";
import type { ModelIdentity } from "./model-identity";

/** Everything the runtime needs to know about a model without calling it. */
export class ModelDescriptor {
	public constructor(
		public readonly identity: ModelIdentity,
		public readonly contextWindow: ContextWindow,
		public readonly capabilities: ModelCapabilities,
	) {}
}
