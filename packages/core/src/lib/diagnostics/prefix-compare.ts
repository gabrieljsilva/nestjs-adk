import type { ContextSegmentKind, ContextSnapshot, PrefixDivergence, PrefixReport } from "./context-types";

/** Characters of context shown after the divergence point: enough to spot a timestamp, not a wall of text. */
const EXCERPT_LENGTH = 80;

interface FlatContext {
	text: string;
	/** Segment boundaries as absolute end offsets, aligned with `kinds`. */
	ends: number[];
	kinds: ContextSegmentKind[];
}

function flatten(snapshot: ContextSnapshot): FlatContext {
	const ends: number[] = [];
	const kinds: ContextSegmentKind[] = [];
	let text = "";
	for (const segment of snapshot.segments) {
		text += segment.text;
		ends.push(text.length);
		kinds.push(segment.kind);
	}
	return { text, ends, kinds };
}

function commonPrefixLength(texts: string[]): number {
	const shortest = Math.min(...texts.map((text) => text.length));
	for (let index = 0; index < shortest; index++) {
		const char = texts[0]?.[index];
		for (let other = 1; other < texts.length; other++) {
			if (texts[other]?.[index] !== char) return index;
		}
	}
	return shortest;
}

/** Which segment an absolute offset falls into; an offset past the end belongs to the last segment. */
function locate(context: FlatContext, offset: number): { segment: ContextSegmentKind; segmentOffset: number } {
	for (let index = 0; index < context.ends.length; index++) {
		const end = context.ends[index] ?? 0;
		if (offset < end) {
			const start = index === 0 ? 0 : (context.ends[index - 1] ?? 0);
			return { segment: context.kinds[index] ?? "contents", segmentOffset: offset - start };
		}
	}
	const last = context.ends.length - 1;
	const start = last <= 0 ? 0 : (context.ends[last - 1] ?? 0);
	return { segment: context.kinds[last] ?? "contents", segmentOffset: offset - start };
}

/**
 * Stable Prefix: how much of the context stays byte-identical across runs, the whole basis of
 * implicit prefix caching. The ratio is measured in CHARS on purpose: being a ratio, most of the
 * char→token conversion error cancels out between numerator and denominator, and it stays exact
 * and tokenizer-free. The denominator is the LARGEST context compared, so the number reflects
 * what the bigger run actually pays.
 */
export function comparePrefix(snapshots: ContextSnapshot[]): PrefixReport {
	if (snapshots.length < 2) {
		throw new Error(`comparePrefix needs at least 2 snapshots to compare, received ${snapshots.length}.`);
	}

	const contexts = snapshots.map(flatten);
	const texts = contexts.map((context) => context.text);
	const prefixChars = commonPrefixLength(texts);
	const totalChars = Math.max(...texts.map((text) => text.length));

	const identical = texts.every((text) => text.length === prefixChars);
	let divergesAt: PrefixDivergence | undefined;
	if (!identical) {
		// The longest context always reaches the divergence point, so it names the segment.
		const longest = contexts.reduce((a, b) => (b.text.length > a.text.length ? b : a));
		divergesAt = {
			...locate(longest, prefixChars),
			offset: prefixChars,
			excerpts: texts.map((text) => text.slice(prefixChars, prefixChars + EXCERPT_LENGTH)),
		};
	}

	return {
		ratio: totalChars === 0 ? 1 : prefixChars / totalChars,
		prefixChars,
		totalChars,
		divergesAt,
	};
}
