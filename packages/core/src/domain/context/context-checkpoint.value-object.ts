import type { ContentDigest } from "../../common/digest/content-digest.value-object";
import type { SessionId } from "../../common/identity/session-id.value-object";
import type { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { ContextBlock } from "./context-block.value-object";

/**
 * A compacted prefix kept so the next call does not compact the same history again.
 *
 * Disposable: a checkpoint that no longer matches is discarded silently and the journal
 * is projected again. Failing to write or read one never fails a run.
 */
export class ContextCheckpoint {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly coveredRevision: SessionRevision,
		public readonly strategy: string,
		public readonly strategyVersion: number,
		public readonly prefixDigest: ContentDigest,
		public readonly blocks: readonly ContextBlock[],
	) {}

	public get key(): string {
		return `${this.sessionId.value}:${this.coveredRevision.value}:${this.strategyVersion}`;
	}

	public isUsableAt(strategy: string, strategyVersion: number, expectedPrefix: ContentDigest): boolean {
		if (this.strategy !== strategy) return false;
		if (this.strategyVersion !== strategyVersion) return false;
		return this.prefixDigest.equals(expectedPrefix);
	}
}
