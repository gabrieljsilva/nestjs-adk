import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";

const FALLBACK_LIMIT = 20_000;

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

	public static resolveDefaultLimit(thresholdCharacters: number | undefined): number {
		const resolved = thresholdCharacters ?? FALLBACK_LIMIT;
		return resolved > 0 ? resolved : FALLBACK_LIMIT;
	}

	public get hasMore(): boolean {
		return this.offset + this.text.length < this.totalCharacters;
	}

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
