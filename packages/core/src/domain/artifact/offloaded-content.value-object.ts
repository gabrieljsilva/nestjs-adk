import type { ArtifactReference } from "./artifact-reference.value-object";
import { OffloadDecision } from "./offload-decision.value-object";

/**
 * What the model reads, and what it can ask for if the text is not enough.
 *
 * A result that fit stays itself: `text` is the whole thing and there is no reference.
 * One that did not becomes a placeholder naming the artifact, and the reference is how
 * it is fetched back. Both cases are the same type on purpose, so nothing downstream
 * has to ask whether an offload happened before it can read a result.
 */
export class OffloadedContent {
	private constructor(
		public readonly text: string,
		public readonly reference?: ArtifactReference,
		/** What the policy decided, which is what the placeholder was written from. */
		public readonly decision: OffloadDecision = OffloadDecision.INLINE,
	) {}

	public static inline(text: string): OffloadedContent {
		return new OffloadedContent(text);
	}

	/**
	 * The decision travels only as far as the sentence it writes. What is durable is the
	 * reference, and re-deciding later, under a policy that has since changed, would change
	 * what a conversation already said about content nobody moved.
	 */
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
