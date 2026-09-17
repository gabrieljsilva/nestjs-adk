import type { ArtifactReference } from "./artifact-reference.value-object";
import { OffloadDecision } from "./offload-decision.value-object";

export class OffloadedContent {
	private constructor(
		public readonly text: string,
		public readonly reference?: ArtifactReference,
		public readonly decision: OffloadDecision = OffloadDecision.INLINE,
	) {}

	public static inline(text: string): OffloadedContent {
		return new OffloadedContent(text);
	}

	public static offloaded(
		reference: ArtifactReference,
		decision: OffloadDecision = OffloadDecision.OPAQUE,
	): OffloadedContent {
		return new OffloadedContent(reference.toString(decision), reference, decision);
	}

	public get wasOffloaded(): boolean {
		return this.reference !== undefined;
	}
}
