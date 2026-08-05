import type { ContentDigest } from "../../common/digest/content-digest";
import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import type { CompactionStrategy } from "../../contracts/compaction-strategy";
import type { SessionStorage } from "../../contracts/session-storage";
import { CompactionDecision } from "../../domain/context/compaction-decision";
import type { ContextBlock } from "../../domain/context/context-block";
import { ContextBudget } from "../../domain/context/context-budget";
import { ContextCheckpoint } from "../../domain/context/context-checkpoint";
import type { ContextComposition } from "../../domain/context/context-composition";
import { ContextProjection } from "../../domain/context/context-projection";
import { PreparedModelContext } from "../../domain/context/prepared-model-context";
import type { ContextMeasurer } from "./context-measurer";
import type { ContextProjector } from "./context-projector";
import type { ContextWindowNotifier } from "./context-window-notifier";
import type { PrepareContextCommand } from "./prepare-context-command";
import type { StablePrefixDigest } from "./stable-prefix-digest";

/**
 * The one road from a persisted journal to a model call.
 *
 * It projects, measures the composition of what it built, compacts when a policy says
 * so and refuses only what a declared window plus a measured usage prove will not fit.
 * A checkpoint is taken when compaction happened and reused when it still describes the
 * same prefix, so a long session is not compacted from scratch on every turn.
 *
 * Nothing here is remembered between calls: the journal is the truth, the checkpoint is
 * an optimization, and the prepared context is a value the caller owns.
 */
export class ContextManager {
	public constructor(
		private readonly storage: SessionStorage,
		private readonly projector: ContextProjector,
		private readonly measurer: ContextMeasurer,
		private readonly digest: StablePrefixDigest,
		private readonly strategy: CompactionStrategy,
		private readonly notifier: ContextWindowNotifier,
	) {}

	public async prepare(command: PrepareContextCommand): Promise<PreparedModelContext> {
		const descriptor = command.model.descriptor();
		this.notifier.reportIfUnknown(descriptor);

		const prefix = ContextProjection.of([], command.tools, command.runtimeInstructions, command.agentPrompt);
		const prefixDigest = this.digest.of(prefix);
		const projection = prefix.withBlocks(await this.blocksOf(command.sessionId, prefixDigest, command.runId));

		const budget = this.budgetOf(projection, command);
		const decision = command.compaction?.decide(budget) ?? CompactionDecision.skip();
		if (!decision.shouldCompact) {
			budget.verify(descriptor.identity);
			return new PreparedModelContext(projection, budget, prefixDigest, false);
		}

		// The usage describes the prompt as it was before compaction, so that is the size it is scaled from.
		const compacted = await this.strategy.compact(projection, decision);
		const compactedBudget = this.budgetOf(compacted, command, budget.composition.characters);
		await this.checkpoint(command.sessionId, compacted, prefixDigest, compactedBudget.composition);
		compactedBudget.verify(descriptor.identity);
		return new PreparedModelContext(compacted, compactedBudget, prefixDigest, true);
	}

	/** A usable checkpoint replaces the journal it covers; anything else means projecting it all. */
	private async blocksOf(
		sessionId: SessionId,
		prefixDigest: ContentDigest,
		runId?: AgentRunId,
	): Promise<readonly ContextBlock[]> {
		const checkpoint = await this.usableCheckpoint(sessionId, prefixDigest);
		const from = checkpoint?.coveredRevision ?? SessionRevision.initial();
		const tail = await this.projector.project(this.storage.readEvents(sessionId, from), runId);
		return checkpoint === undefined ? tail : [...checkpoint.blocks, ...tail];
	}

	private async usableCheckpoint(
		sessionId: SessionId,
		prefixDigest: ContentDigest,
	): Promise<ContextCheckpoint | undefined> {
		const checkpoint = await this.storage.findCheckpoint(sessionId);
		if (checkpoint === undefined) return undefined;
		return checkpoint.isUsableAt(this.strategy.name, this.strategy.version, prefixDigest) ? checkpoint : undefined;
	}

	private budgetOf(
		projection: ContextProjection,
		command: PrepareContextCommand,
		measuredAtCharacters?: number,
	): ContextBudget {
		return new ContextBudget(
			command.model.descriptor().contextWindow,
			this.measurer.measure(projection),
			command.lastUsage,
			command.lastUsageCharacters ?? measuredAtCharacters,
		);
	}

	/** The checkpoint is an optimization, so failing to write one never fails the call. */
	private async checkpoint(
		sessionId: SessionId,
		projection: ContextProjection,
		prefixDigest: ContentDigest,
		composition: ContextComposition,
	): Promise<void> {
		const checkpoint = new ContextCheckpoint(
			sessionId,
			projection.coveredRevision,
			this.strategy.name,
			this.strategy.version,
			prefixDigest,
			projection.blocks,
			composition,
		);
		try {
			await this.storage.saveCheckpoint(checkpoint);
		} catch {
			return undefined;
		}
	}
}
