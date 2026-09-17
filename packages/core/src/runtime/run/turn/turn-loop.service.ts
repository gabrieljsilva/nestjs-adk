import type { ToolCallObserver } from "../../../contracts/tool/tool-call-observer.contract";
import type { PreparedModelContext } from "../../../domain/context/prepared-model-context.value-object";
import { BilledCall } from "../../../domain/cost/billed-call.value-object";
import type { SessionEventBatch } from "../../../domain/event/session-event-batch.value-object";
import { EmptyModelResponseError } from "../../../domain/model/errors/empty-model-response.error";
import type { ModelChunk } from "../../../domain/model/streaming/model-chunk.value-object";
import type { PendingCall } from "../../../domain/session/approval/pending-call.value-object";
import { AgentMaxIterationsError } from "../../../domain/session/errors/agent-max-iterations.error";
import { AgentMaxTransfersError } from "../../../domain/session/errors/agent-max-transfers.error";
import type { SessionState } from "../../../domain/session/state/session-state.value-object";
import { ToolCallNotice } from "../../../domain/tool/notice/tool-call.notice";
import type { ContextService } from "../../context/context.service";
import { PrepareContextCommand } from "../../context/prepare-context.command";
import { DelegatedTurnLoop } from "../../delegation/delegated-turn-loop.contract";
import type { DelegationRunner } from "../../delegation/delegation-runner.service";
import { ContextPhotographer } from "../../diagnostics/context-photographer.service";
import type { ModelRunOutcome } from "../../model/model-run-outcome.value-object";
import { ModelRunCommand } from "../../model/model-run.command";
import type { ModelService } from "../../model/model.service";
import type { OpenedSession } from "../../session/opened-session.value-object";
import type { SessionRepository } from "../../session/session-repository.service";
import type { ChunkSink } from "../../stream/chunk-sink.contract";
import type { TransferSessionUseCase } from "../../transfer/transfer-session.use-case";
import type { RunJournal } from "../journal/run-journal.service";
import { RunObservers } from "../journal/run-observers.value-object";
import type { RunScope } from "../scope/run-scope.value-object";
import type { RunProgress } from "../settle/run-progress.value-object";
import type { ApprovalGate } from "./approval-gate.service";
import type { TurnExecutor } from "./turn-executor.service";

const MAX_TRANSFERS = 8;

export class TurnLoop extends DelegatedTurnLoop {
	public constructor(
		private readonly context: ContextService,
		private readonly models: ModelService,
		private readonly sessions: SessionRepository,
		private readonly journal: RunJournal,
		private readonly executor: TurnExecutor,
		private readonly gate: ApprovalGate,
		private readonly agents: TransferSessionUseCase,
		private readonly delegations: DelegationRunner,
		private readonly photographer: ContextPhotographer = new ContextPhotographer(),
	) {
		super();
	}

	public async run(
		scope: RunScope,
		opened: OpenedSession,
		progress: RunProgress,
		observers: RunObservers = RunObservers.none(),
	): Promise<void> {
		let current = scope;
		let iterations = 0;
		let transfers = 0;

		for (;;) {
			const prepared = await this.prepare(current, opened, progress.state);
			observers.context?.capture(
				this.photographer.of(current.agent, current.model.descriptor().identity, prepared.projection),
			);
			const outcome = await this.consume(this.models.stream(this.buildCommand(current, prepared)), observers.chunks);
			const calls = outcome.response.toolCalls;
			const empty = outcome.response.isEmpty;
			if (outcome.response.hasText) progress.said(outcome.response.text);
			if (outcome.response.structuredOutput !== undefined) progress.answered(outcome.response.structuredOutput);

			current = await this.commit(
				current,
				progress,
				this.journal.turn(current.started, outcome, prepared.characters, calls.length === 0 && !empty),
			);
			progress.charged(new BilledCall(outcome.servedBy, outcome.response.usage));

			if (empty) throw new EmptyModelResponseError(current.agent.value, outcome.servedBy.toString());
			if (calls.length === 0) return;

			iterations += 1;
			if (!current.limits.allowsIteration(iterations)) {
				throw new AgentMaxIterationsError(current.agent.value, current.limits.maxIterations ?? iterations);
			}

			const turn = this.gate.screen(current.catalog, calls, current.actor);
			await this.announce(current, turn, observers.tools);
			if (this.gate.holdsAny(turn)) {
				current = await this.commit(current, progress, this.journal.suspension(current.started, turn));
				progress.suspend();
				return;
			}

			const delegated = await this.delegations.runAll(current, opened, progress, turn);
			const batch = await this.executor.execute(current, turn, false, delegated, observers.tools);
			current = await this.commit(current, progress, batch);

			const target = batch.findTransferTarget();
			if (target !== undefined) {
				transfers += 1;
				if (transfers > MAX_TRANSFERS) throw new AgentMaxTransfersError(current.agent.value, MAX_TRANSFERS);
				current = await this.agents.execute(current, target);
			}
		}
	}

	private async consume(turn: AsyncGenerator<ModelChunk, ModelRunOutcome>, sink?: ChunkSink): Promise<ModelRunOutcome> {
		let step = await turn.next();
		while (step.done !== true) {
			sink?.emit(step.value);
			step = await turn.next();
		}
		return step.value;
	}

	private async announce(scope: RunScope, turn: readonly PendingCall[], observer?: ToolCallObserver): Promise<void> {
		if (observer === undefined) return;
		for (const call of turn) {
			await observer.requested(scope.context, ToolCallNotice.fromCall(call, scope.catalog.find(call.toolName)));
		}
	}

	private async commit(scope: RunScope, progress: RunProgress, batch: SessionEventBatch): Promise<RunScope> {
		progress.advanced(await this.sessions.commit(scope.context, progress.state.revision, batch, progress.state));
		return scope.withMetadata(progress.state.metadata);
	}

	private async prepare(scope: RunScope, opened: OpenedSession, state: SessionState): Promise<PreparedModelContext> {
		const measured = state.lastPrompt?.takenBy(scope.model.descriptor().identity);
		return this.context.prepare(
			new PrepareContextCommand({
				context: scope.context,
				model: scope.model,
				tools: scope.catalog.declarations(),
				agentPrompt: scope.skills.instructions(scope.instructions),
				compaction: scope.compaction,
				lastPrompt: measured,
				outputSchema: scope.definition.outputSchema,
			}),
		);
	}

	private buildCommand(scope: RunScope, prepared: PreparedModelContext): ModelRunCommand {
		return new ModelRunCommand({
			context: scope.context,
			runId: scope.run.id,
			agent: scope.agent,
			model: scope.model,
			request: prepared.request,
			retry: scope.definition.retry,
			failover: scope.definition.failover,
			signal: scope.signal,
		});
	}
}
