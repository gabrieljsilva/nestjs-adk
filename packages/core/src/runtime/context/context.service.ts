import type { ContentDigest } from "../../common/digest/content-digest.value-object";
import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { CompactionStrategy } from "../../contracts/context/compaction-strategy.contract";
import type { SessionStorage } from "../../contracts/storage/session-storage.contract";
import { CompactionDecision } from "../../domain/context/compaction-decision.value-object";
import type { ContextBlock } from "../../domain/context/context-block.value-object";
import { ContextBudget } from "../../domain/context/context-budget.value-object";
import { ContextCheckpoint } from "../../domain/context/context-checkpoint.value-object";
import { ContextProjection } from "../../domain/context/context-projection.value-object";
import { PreparedModelContext } from "../../domain/context/prepared-model-context.value-object";
import { ModelCapability } from "../../domain/model/descriptor/model-capability.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import type { ContextMeasurer } from "./context-measurer.service";
import type { ContextProjector } from "./context-projector.service";
import type { ContextWindowNotifier } from "./context-window-notifier.service";
import type { PrepareContextCommand } from "./prepare-context.command";
import type { StablePrefixDigest } from "./stable-prefix-digest.service";

export class ContextService {
	public constructor(
		private readonly storage: SessionStorage,
		private readonly projector: ContextProjector,
		private readonly measurer: ContextMeasurer,
		private readonly digest: StablePrefixDigest,
		private readonly strategy: CompactionStrategy,
		private readonly notifier: ContextWindowNotifier,
	) {}

	public forgetSession(context: SessionContext): void {
		this.projector.forgetAttachments(context);
	}

	public async prepare(command: PrepareContextCommand): Promise<PreparedModelContext> {
		const descriptor = command.model.descriptor();
		this.notifier.reportIfUnknown(command.context, descriptor);

		const prefix = new ContextProjection(
			[],
			command.tools,
			command.runtimeInstructions,
			command.agentPrompt,
			command.outputSchema,
		);
		const prefixDigest = this.digest.of(prefix);
		const acceptsRemoteUrl = descriptor.capabilities.supports(ModelCapability.MEDIA_URL);
		const projection = prefix.withBlocks(
			await this.buildBlocks(command.context, prefixDigest, command.runId, acceptsRemoteUrl),
		);

		const budget = this.buildBudget(projection, command);
		const decision = command.compaction?.decide(budget) ?? CompactionDecision.skip();
		if (!decision.shouldCompact) {
			budget.verify(descriptor.identity);
			return new PreparedModelContext(projection, budget, prefixDigest, false);
		}

		const compacted = await this.strategy.compact(command.context, projection, decision);
		const compactedBudget = this.buildBudget(compacted, command);
		await this.checkpoint(command.context, compacted, prefixDigest);
		compactedBudget.verify(descriptor.identity);
		return new PreparedModelContext(compacted, compactedBudget, prefixDigest, true);
	}

	private async buildBlocks(
		context: RunContext,
		prefixDigest: ContentDigest,
		runId?: AgentRunId,
		acceptsRemoteUrl = false,
	): Promise<readonly ContextBlock[]> {
		const checkpoint = await this.usableCheckpoint(context, prefixDigest);
		const from = checkpoint?.coveredRevision ?? SessionRevision.initial();
		const events = this.storage.readEvents(context, from);
		const tail = await this.projector.project(context, events, runId, acceptsRemoteUrl);
		return checkpoint === undefined ? tail : [...checkpoint.blocks, ...tail];
	}

	private async usableCheckpoint(
		context: RunContext,
		prefixDigest: ContentDigest,
	): Promise<ContextCheckpoint | undefined> {
		const checkpoint = await this.storage.findCheckpoint(context);
		if (checkpoint === undefined) return undefined;
		return checkpoint.isUsableAt(this.strategy.name, this.strategy.version, prefixDigest) ? checkpoint : undefined;
	}

	private buildBudget(projection: ContextProjection, command: PrepareContextCommand): ContextBudget {
		return new ContextBudget(
			command.model.descriptor().contextWindow,
			command.lastPrompt,
			this.measurer.measure(projection),
		);
	}

	private async checkpoint(
		context: RunContext,
		projection: ContextProjection,
		prefixDigest: ContentDigest,
	): Promise<void> {
		const checkpoint = new ContextCheckpoint(
			context.sessionId,
			projection.coveredRevision,
			this.strategy.name,
			this.strategy.version,
			prefixDigest,
			projection.blocks,
		);
		try {
			await this.storage.saveCheckpoint(context, checkpoint);
		} catch {
			return undefined;
		}
	}
}
