import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";

/** What the default page is when the policy moves nothing out, so paging still means something. */
const FALLBACK_LIMIT = 20_000;

/**
 * One window over an artifact, and enough around it for the model to ask for the next.
 *
 * Every number it answers is about characters, which is the unit the placeholder used and
 * the unit the offload threshold is written in, so a model that reads "40000 characters" and
 * asks for 20000 of them gets exactly half. A window past the end is empty rather than
 * refused: it is how a model finds out where the content stops.
 */
export class ArtifactPage {
	private constructor(
		public readonly text: string,
		public readonly offset: number,
		public readonly totalCharacters: number,
	) {}

	public static fromContent(content: ArtifactContent, offset: number, limit: number): ArtifactPage {
		const total = content.characters;
		const start = Math.min(Math.max(0, Math.trunc(offset)), total);
		const size = Math.max(0, Math.trunc(limit));
		return new ArtifactPage(content.text.slice(start, start + size), start, total);
	}

	/** The page the runtime would take when nobody said, which is the largest it lets sit in a context. */
	public static resolveDefaultLimit(thresholdCharacters: number | undefined): number {
		const resolved = thresholdCharacters ?? FALLBACK_LIMIT;
		return resolved > 0 ? resolved : FALLBACK_LIMIT;
	}

	public get hasMore(): boolean {
		return this.offset + this.text.length < this.totalCharacters;
	}

	/** What the model reads: the page, where it sits, and whether asking again is worth a call. */
	public toResult(reference: ArtifactReference): Record<string, unknown> {
		return {
			artifactId: reference.id.value,
			mediaType: reference.mediaType,
			offset: this.offset,
			text: this.text,
			totalCharacters: this.totalCharacters,
			hasMore: this.hasMore,
			nextOffset: this.hasMore ? this.offset + this.text.length : undefined,
		};
	}
}
