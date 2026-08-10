import type { ContentDigest } from "../../common/digest/content-digest";
import { DeepFreeze } from "../../common/immutability/deep-freeze";
import type { SessionRevision } from "../../common/revision/session-revision";
import type { ModelRequest } from "../model/model-request";
import type { ContextBudget } from "./context-budget";
import type { ContextProjection } from "./context-projection";

/**
 * One context, measured and closed for changes, ready to become a model call.
 *
 * It freezes itself on construction: compaction that tried to edit a projection in
 * place would fail here rather than quietly change what a previous call measured. The
 * digest covers the stable prefix, which is what a checkpoint compares against and
 * what provider side caching depends on staying byte identical.
 *
 * What it reports about size is characters, which is all anyone can know before the call.
 * A number of tokens appears only once a provider has answered, through the budget, and
 * only when there is one.
 */
export class PreparedModelContext {
	public readonly request: ModelRequest;

	public constructor(
		public readonly projection: ContextProjection,
		public readonly budget: ContextBudget,
		public readonly prefixDigest: ContentDigest,
		public readonly compacted: boolean = false,
	) {
		this.request = projection.toRequest();
		DeepFreeze.apply(this);
	}

	/** How large this context is, in characters of the text it will send. */
	public get characters(): number {
		return this.budget.characters;
	}

	public get coveredRevision(): SessionRevision {
		return this.projection.coveredRevision;
	}
}
