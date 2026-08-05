import type { ContextBlock } from "../domain/context/context-block";

/**
 * Turns the blocks compaction is about to drop into one shorter block of text.
 *
 * Implementing it is optional. Without a summarizer, compaction simply forgets the
 * oldest closed exchanges; with one, it forgets them and keeps a summary in their
 * place. A summarizer that fails never fails the run: the compaction still happened.
 */
export abstract class ContextSummarizer {
	public abstract summarize(blocks: readonly ContextBlock[]): Promise<string>;
}
