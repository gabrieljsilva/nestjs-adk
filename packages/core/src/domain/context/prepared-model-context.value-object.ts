import type { ContentDigest } from "../../common/digest/content-digest.value-object";
import { DeepFreeze } from "../../common/immutability/deep-freeze.service";
import type { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { ModelRequest } from "../model/model-request.value-object";
import type { ContextBudget } from "./context-budget.value-object";
import type { ContextProjection } from "./context-projection.value-object";

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

	public get characters(): number {
		return this.budget.characters;
	}

	public get coveredRevision(): SessionRevision {
		return this.projection.coveredRevision;
	}
}
