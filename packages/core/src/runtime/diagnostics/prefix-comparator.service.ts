import type { ContextSnapshot } from "../../domain/diagnostics/context-snapshot.value-object";
import { PrefixDivergence } from "../../domain/diagnostics/prefix-divergence.value-object";
import { PrefixReport } from "../../domain/diagnostics/prefix-report.value-object";

const EXCERPT = 80;

export class PrefixComparator {
	public compare(snapshots: readonly ContextSnapshot[]): PrefixReport {
		const texts = snapshots.map((snapshot) => snapshot.text);
		const total = Math.max(0, ...texts.map((text) => text.length));
		if (texts.length < 2) return new PrefixReport(total, total);

		const shared = this.sharedLength(texts);
		if (shared === total) return new PrefixReport(total, total);
		return new PrefixReport(shared, total, this.divergenceAt(snapshots, texts, shared));
	}

	private sharedLength(texts: readonly string[]): number {
		const shortest = Math.min(...texts.map((text) => text.length));
		for (let index = 0; index < shortest; index += 1) {
			const char = texts[0]?.[index];
			if (texts.some((text) => text[index] !== char)) return index;
		}
		return shortest;
	}

	private divergenceAt(
		snapshots: readonly ContextSnapshot[],
		texts: readonly string[],
		offset: number,
	): PrefixDivergence {
		const located = this.locate(snapshots[0], offset);
		return new PrefixDivergence(
			located.segment,
			offset,
			located.segmentOffset,
			texts.map((text) => text.slice(offset, offset + EXCERPT)),
		);
	}

	private locate(snapshot: ContextSnapshot | undefined, offset: number): { segment: string; segmentOffset: number } {
		let start = 0;
		for (const segment of snapshot?.segments ?? []) {
			const end = start + segment.characters;
			if (offset < end) return { segment: segment.kind, segmentOffset: offset - start };
			start = end;
		}
		return { segment: snapshot?.segments.at(-1)?.kind ?? "conversation", segmentOffset: offset - start };
	}
}
