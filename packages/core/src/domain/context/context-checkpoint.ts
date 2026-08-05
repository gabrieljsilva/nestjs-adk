import type { ContentDigest } from "../../common/digest/content-digest";
import type { SessionId } from "../../common/identity/session-id";
import type { SessionRevision } from "../../common/revision/session-revision";
import type { ContextBlock } from "./context-block";
import type { ContextComposition } from "./context-composition";

/**
 * A compacted prefix kept so the next call does not compact the same history again.
 *
 * Disposable like a snapshot: anything suspicious means projecting from the journal
 * once more, never a failed run. It records the strategy that wrote it and the digest
 * of the prefix it replaced, which is what makes a stale or foreign checkpoint
 * detectable instead of silently wrong.
 */
export class ContextCheckpoint {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly coveredRevision: SessionRevision,
		public readonly strategy: string,
		public readonly strategyVersion: number,
		public readonly prefixDigest: ContentDigest,
		public readonly blocks: readonly ContextBlock[],
		public readonly composition: ContextComposition,
	) {}

	/** Identity of a checkpoint: writing the same one twice writes it once. */
	public get key(): string {
		return `${this.sessionId.value}:${this.coveredRevision.value}:${this.strategyVersion}`;
	}

	/**
	 * True when this checkpoint still describes the prefix it claims to.
	 * Another strategy, or another version of the same one, ahead or behind, discards it:
	 * the compacted text was written by rules that are no longer the ones in force.
	 */
	public isUsableAt(strategy: string, strategyVersion: number, expectedPrefix: ContentDigest): boolean {
		if (this.strategy !== strategy) return false;
		if (this.strategyVersion !== strategyVersion) return false;
		return this.prefixDigest.equals(expectedPrefix);
	}
}
