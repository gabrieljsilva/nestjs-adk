import type { ArtifactReference } from "./artifact-reference";

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
	) {}

	public static inline(text: string): OffloadedContent {
		return new OffloadedContent(text);
	}

	public static offloaded(reference: ArtifactReference): OffloadedContent {
		return new OffloadedContent(reference.toString(), reference);
	}

	public get wasOffloaded(): boolean {
		return this.reference !== undefined;
	}
}
