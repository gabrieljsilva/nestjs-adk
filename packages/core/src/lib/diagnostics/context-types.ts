/** Context diagnostics types. Pure data: filled by engines, consumed by the comparators. */

/** Context sections, in the order they reach the provider: stable first, volatile last. */
export type ContextSegmentKind = "systemInstruction" | "toolDeclarations" | "contents";

export interface ContextSegment {
	kind: ContextSegmentKind;
	/** Deterministic serialization: this is the text the prefix comparison runs on. */
	text: string;
}

/** What one model call received, normalized by the engine adapter. */
export interface ContextSnapshot {
	/** Agent that owns the call; sub-agents produce their own snapshots. */
	agent: string;
	model?: string;
	segments: ContextSegment[];
}

export interface PrefixDivergence {
	/** Segment the first differing character falls into. */
	segment: ContextSegmentKind;
	/** Offset within the whole serialized context. */
	offset: number;
	/** Offset within the diverging segment. */
	segmentOffset: number;
	/** Text right after the divergence point, one entry per compared snapshot. */
	excerpts: string[];
}

export interface PrefixReport {
	/** Common prefix over the LARGEST context compared: the worst case, which is what the bigger run pays. */
	ratio: number;
	prefixChars: number;
	totalChars: number;
	/** Absent when the compared contexts are byte-identical. */
	divergesAt?: PrefixDivergence;
}

export interface CacheReport {
	/**
	 * False when no sampled call reported cached tokens. Never read this as "zero cache":
	 * the provider simply did not tell, and reporting 0% would send the dev chasing a bug that isn't there.
	 */
	available: boolean;
	ratio: number;
	cachedTokens: number;
	promptTokens: number;
	/** Runs that fed the calculation: warm-up excluded, and only those the provider reported on. */
	sampledRuns: number;
	/** Runs left out because the provider said nothing about cached tokens. */
	silentRuns: number;
}
