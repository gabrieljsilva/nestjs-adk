import { CompactionStrategy } from "../../contracts/compaction-strategy";
import type { ContextSummarizer } from "../../contracts/context-summarizer";
import type { CompactionDecision } from "../../domain/context/compaction-decision";
import { ContextBlock } from "../../domain/context/context-block";
import type { ContextProjection } from "../../domain/context/context-projection";
import { UserMessage } from "../../domain/model/user-message";
import type { ContextMeasurer } from "./context-measurer";

/** Two rounds are enough: one to make room, one to make room for the summary itself. */
const MAX_ROUNDS = 2;

/**
 * Drops the oldest answered exchanges until the context fits, and never anything else.
 *
 * Open obligations stay: a call still waiting for its result is a promise the model
 * made, and dropping it would leave the run unable to explain itself. Closed blocks are
 * removed whole, so a call never survives without its result, and the most recent
 * blocks the decision asks to keep are protected regardless of age.
 *
 * The target is a size in characters, derived from the share the decision carries. That
 * keeps the loop local and synchronous while remaining anchored to the measurement the
 * policy decided on, which came from a provider.
 *
 * A summary costs room like anything else, so writing one reopens the question of
 * whether the result fits. The strategy answers it by dropping further and rewriting the
 * summary over everything that fell, and gives the summary up rather than the target if
 * the two cannot both be had.
 */
export class OldestFirstCompactionStrategy extends CompactionStrategy {
	public readonly name = "oldest-first";
	public readonly version = 1;

	public constructor(
		private readonly measurer: ContextMeasurer,
		private readonly summarizer?: ContextSummarizer,
	) {
		super();
	}

	public async compact(projection: ContextProjection, decision: CompactionDecision): Promise<ContextProjection> {
		const target = decision.targetOf(this.measurer.measure(projection).characters);
		const kept = [...projection.blocks];
		const dropped: ContextBlock[] = [];
		let summary: ContextBlock | undefined;

		for (let round = 0; round < MAX_ROUNDS; round += 1) {
			this.dropUntilItFits(projection, kept, dropped, summary, decision, target);
			if (this.summarizer === undefined || dropped.length === 0) break;
			summary = await this.summaryOf(dropped);
			if (summary === undefined) break;
			if (this.fits(this.assemble(projection, kept, summary), target)) break;
		}

		const summarized = this.assemble(projection, kept, summary);
		if (summary === undefined) return summarized;
		return this.fits(summarized, target) ? summarized : this.assemble(projection, kept, undefined);
	}

	/** Removes the oldest removable block, one at a time, measuring what is left after each. */
	private dropUntilItFits(
		projection: ContextProjection,
		kept: ContextBlock[],
		dropped: ContextBlock[],
		summary: ContextBlock | undefined,
		decision: CompactionDecision,
		target: number,
	): void {
		while (!this.fits(this.assemble(projection, kept, summary), target)) {
			const protectedFrom = kept.length - decision.keepRecentBlocks;
			const oldest = kept.findIndex((block, position) => position < protectedFrom && block.isRemovable);
			if (oldest === -1) return;
			const [removed] = kept.splice(oldest, 1);
			if (removed !== undefined) dropped.push(removed);
		}
	}

	private assemble(
		projection: ContextProjection,
		kept: readonly ContextBlock[],
		summary: ContextBlock | undefined,
	): ContextProjection {
		return projection.withBlocks(summary === undefined ? kept : [summary, ...kept]);
	}

	/** A summarizer that fails costs the summary, never the compaction. */
	private async summaryOf(dropped: readonly ContextBlock[]): Promise<ContextBlock | undefined> {
		if (this.summarizer === undefined) return undefined;
		const first = dropped[0];
		if (first === undefined) return undefined;
		try {
			const text = await this.summarizer.summarize([...dropped]);
			if (text.trim().length === 0) return undefined;
			return ContextBlock.summary(new UserMessage(text), first.firstRevision);
		} catch {
			return undefined;
		}
	}

	private fits(projection: ContextProjection, target: number): boolean {
		return this.measurer.measure(projection).characters <= target;
	}
}
