import { CompactionStrategy } from "../../contracts/context/compaction-strategy.contract";
import type { ContextSummarizer } from "../../contracts/context/context-summarizer.contract";
import type { CompactionDecision } from "../../domain/context/compaction-decision.value-object";
import { ContextBlock } from "../../domain/context/context-block.value-object";
import type { ContextProjection } from "../../domain/context/context-projection.value-object";
import { UserMessage } from "../../domain/model/messages/user-message.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";
import type { ContextMeasurer } from "./context-measurer.service";

const MAX_COMPACTION_ROUNDS = 2;

/**
 * The compaction strategy a runtime uses unless the application declares another. It drops
 * the oldest answered exchanges until the context fits and never anything else: a call still
 * waiting for its result stays, and the most recent blocks are protected regardless of age.
 *
 * With a summarizer, what fell is replaced by a summary; the summary is given up rather than
 * the target when the two cannot both be had.
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

	public async compact(
		context: RunContext,
		projection: ContextProjection,
		decision: CompactionDecision,
	): Promise<ContextProjection> {
		const target = decision.calculateTarget(this.measurer.measure(projection));
		const kept = [...projection.blocks];
		const dropped: ContextBlock[] = [];
		let summary: ContextBlock | undefined;

		for (let round = 0; round < MAX_COMPACTION_ROUNDS; round += 1) {
			this.dropUntilItFits(projection, kept, dropped, summary, decision, target);
			if (this.summarizer === undefined || dropped.length === 0) break;
			summary = await this.buildSummary(context, dropped);
			if (summary === undefined) break;
			if (this.fits(this.assemble(projection, kept, summary), target)) break;
		}

		const summarized = this.assemble(projection, kept, summary);
		if (summary === undefined) return summarized;
		return this.fits(summarized, target) ? summarized : this.assemble(projection, kept, undefined);
	}

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

	private async buildSummary(context: RunContext, dropped: readonly ContextBlock[]): Promise<ContextBlock | undefined> {
		if (this.summarizer === undefined) return undefined;
		const first = dropped[0];
		if (first === undefined) return undefined;
		try {
			const text = await this.summarizer.summarize(context, [...dropped]);
			if (text.trim().length === 0) return undefined;
			return ContextBlock.summary(new UserMessage(text), first.firstRevision);
		} catch {
			return undefined;
		}
	}

	private fits(projection: ContextProjection, target: number): boolean {
		return this.measurer.measure(projection) <= target;
	}
}
