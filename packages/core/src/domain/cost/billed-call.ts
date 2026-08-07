import type { ModelIdentity } from "../model/model-identity";
import type { ModelUsage } from "../model/model-usage";

/**
 * One model call that happened, and who served it.
 *
 * This is what a run collects while it runs, and it holds no money. Pricing is I/O, so it
 * happens once when the run is over rather than inside the turn loop: a source that has to
 * fetch a catalog would otherwise be awaited between every turn.
 *
 * The model is the one that actually answered, taken from the outcome rather than from the
 * agent's declaration. After a reroute those are different models, and the bill belongs to
 * the one that did the work.
 */
export class BilledCall {
	public constructor(
		public readonly model: ModelIdentity,
		public readonly usage: ModelUsage,
	) {}
}
