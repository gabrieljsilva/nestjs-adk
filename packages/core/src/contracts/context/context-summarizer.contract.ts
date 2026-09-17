import type { ContextBlock } from "../../domain/context/context-block.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";

/**
 * Turns the blocks compaction is about to drop into one shorter block of text.
 *
 * Optional: without one, compaction simply forgets the oldest closed exchanges. A
 * summarizer that fails never fails the run; the compaction still happened.
 */
export abstract class ContextSummarizer {
	public abstract summarize(context: RunContext, blocks: readonly ContextBlock[]): Promise<string>;
}
