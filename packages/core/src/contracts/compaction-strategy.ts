import type { CompactionDecision } from "../domain/context/compaction-decision";
import type { ContextProjection } from "../domain/context/context-projection";

/**
 * How a context that grew too long becomes one that fits.
 *
 * A strategy answers with another projection and never edits the one it was given.
 * Its name and version travel inside every checkpoint it produces, so a checkpoint
 * written by rules that are no longer in force is recognised and discarded instead of
 * being replayed as if it still meant the same thing.
 *
 * It receives no model. The decision it is given already carries the only measured
 * ground there is, translated into a share to keep, and a strategy that asked a provider
 * how big something is would be asking a question no provider answers before a call.
 */
export abstract class CompactionStrategy {
	public abstract readonly name: string;

	/** Bump it whenever the same input would now produce a different compaction. */
	public abstract readonly version: number;

	public abstract compact(projection: ContextProjection, decision: CompactionDecision): Promise<ContextProjection>;
}
