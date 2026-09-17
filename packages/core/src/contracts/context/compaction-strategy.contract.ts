import type { CompactionDecision } from "../../domain/context/compaction-decision.value-object";
import type { ContextProjection } from "../../domain/context/context-projection.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";

/**
 * How a context that grew too long becomes one that fits. A strategy answers with another
 * projection and never edits the one it was given, which is frozen. Its name and version
 * travel inside every checkpoint it produces, so a checkpoint written under rules no longer
 * in force is discarded rather than replayed.
 */
export abstract class CompactionStrategy {
	public abstract readonly name: string;

	/** Bump it whenever the same input would now produce a different compaction. */
	public abstract readonly version: number;

	public abstract compact(
		context: RunContext,
		projection: ContextProjection,
		decision: CompactionDecision,
	): Promise<ContextProjection>;
}
