import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";

const FALLBACK_LIMIT = 20_000;

export class ArtifactPage {
	private constructor(
		public readonly text: string,
		public readonly offset: number,
		public readonly totalCharacters: number,
		public readonly fromLine?: number,
		public readonly lineCount?: number,
		public readonly totalLines?: number,
	) {}

	public static fromContent(content: ArtifactContent, offset: number, limit: number): ArtifactPage {
		const total = content.characters;
		const start = Math.min(Math.max(0, Math.trunc(offset)), total);
		const size = Math.max(0, Math.trunc(limit));
		return new ArtifactPage(content.text.slice(start, start + size), start, total);
	}

	public static fromRange(text: string, offset: number, totalCharacters: number): ArtifactPage {
		return new ArtifactPage(text, Math.min(Math.max(0, offset), totalCharacters), totalCharacters);
	}

	public static fromLines(content: ArtifactContent, fromLine: number, lines: number, limit: number): ArtifactPage {
		const all = content.text.split("\n");
		const first = Math.min(Math.max(1, Math.trunc(fromLine)), all.length + 1);
		const wanted = Math.max(0, Math.trunc(lines));
		const taken: string[] = [];
		let spent = 0;
		for (const line of all.slice(first - 1, first - 1 + wanted)) {
			const cost = line.length + (taken.length === 0 ? 0 : 1);
			if (taken.length > 0 && spent + cost > limit) break;
			taken.push(line);
			spent += cost;
		}
		return new ArtifactPage(
			taken.join("\n"),
			ArtifactPage.readLineOffset(content.text, first),
			content.characters,
			first,
			taken.length,
			all.length,
		);
	}

	public static fromLineStart(content: ArtifactContent, fromLine: number, limit: number): ArtifactPage {
		return ArtifactPage.fromContent(content, ArtifactPage.readLineOffset(content.text, fromLine), limit);
	}

	public static resolveDefaultLimit(thresholdCharacters: number | undefined): number {
		const resolved = thresholdCharacters ?? FALLBACK_LIMIT;
		return resolved > 0 ? resolved : FALLBACK_LIMIT;
	}

	private static readLineOffset(text: string, fromLine: number): number {
		const first = Math.max(1, Math.trunc(fromLine));
		let offset = 0;
		for (let line = 1; line < first; line += 1) {
			const next = text.indexOf("\n", offset);
			if (next < 0) return text.length;
			offset = next + 1;
		}
		return Math.min(offset, text.length);
	}

	public get hasMore(): boolean {
		if (this.fromLine !== undefined && this.lineCount !== undefined && this.totalLines !== undefined) {
			return this.fromLine - 1 + this.lineCount < this.totalLines;
		}
		return this.offset + this.text.length < this.totalCharacters;
	}

	public toResult(reference: ArtifactReference): Record<string, unknown> {
		const byLine = this.fromLine !== undefined && this.lineCount !== undefined;
		return {
			artifactId: reference.id.value,
			mediaType: reference.mediaType,
			offset: this.offset,
			text: this.text,
			totalCharacters: this.totalCharacters,
			hasMore: this.hasMore,
			nextOffset: this.hasMore && !byLine ? this.offset + this.text.length : undefined,
			fromLine: this.fromLine,
			lines: this.lineCount,
			totalLines: this.totalLines,
			nextLine: this.hasMore && byLine ? (this.fromLine ?? 1) + (this.lineCount ?? 0) : undefined,
		};
	}
}
