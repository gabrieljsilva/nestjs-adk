import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { ModelResolver } from "../../../contracts/model/model-resolver.contract";
import type { ToolCallObserver } from "../../../contracts/tool/tool-call-observer.contract";
import type { ToolSource } from "../../../contracts/tool/tool-source.contract";
import type { AgentDefinition } from "../../../domain/agent/agent-definition.value-object";
import { SessionEventBatch } from "../../../domain/event/session-event-batch.value-object";
import type { LlmModel } from "../../../domain/model/llm-model.contract";
import { RunContext } from "../../../domain/run/run-context.value-object";
import { SessionContext } from "../../../domain/run/session-context.value-object";
import type { ApprovalDecision } from "../../../domain/session/approval/pending-call.value-object";
import type { PendingTurn } from "../../../domain/session/approval/pending-turn.value-object";
import { ApprovalNotPendingError } from "../../../domain/session/errors/approval-not-pending.error";
import type { AgentResult } from "../../../domain/session/run/agent-result.value-object";
import type { Session } from "../../../domain/session/session.entity";
import type { Actor } from "../../../domain/tool/access/actor.value-object";
import type { AgentCatalog } from "../../catalog/agent-catalog.service";
import { OpenedSession } from "../../session/opened-session.value-object";
import type { SessionRepository } from "../../session/session-repository.service";
import { ToolSourceScope } from "../../tool/tool-source-scope.service";
import type { AgentRunFactory } from "../agent-run.factory";
import type { RunJournal } from "../journal/run-journal.service";
import { RunObservers } from "../journal/run-observers.value-object";
import type { RunScopeFactory } from "../scope/run-scope.factory";
import type { RunScope } from "../scope/run-scope.value-object";
import { RunProgress } from "../settle/run-progress.value-object";
import type { RunResultFactory } from "../settle/run-result.factory";
import type { RunSettler } from "../settle/run-settler.service";
import type { StartedRun } from "../settle/started-run.value-object";
import type { TurnExecutor } from "../turn/turn-executor.service";
import type { TurnLoop } from "../turn/turn-loop.service";

/** What a decision carries besides the decision itself. */
export interface ApprovalOptions {
	/** Who agreed or refused, recorded in the journal next to the decision. */
	by?: string;
	/** Why it was refused, which is what the model is told. */
	reason?: string;
	/** Sources opened for this run alone, on top of the module's. */
	sources?: readonly ToolSource[];
	/** The stop button of the turn this decision releases, which is a run of its own. */
	signal?: AbortSignal;
	/** Who is deciding, and on whose behalf the released calls then run. */
	actor?: Actor;
	/** Told about every call of the released turn as it settles, and about the turns that follow. */
	toolCalls?: ToolCallObserver;
}

/**
 * Records one decision, and runs the turn once every held call of it has one.
 *
 * A turn with two calls to answer for stays suspended after the first answer. Running
 * half of it would put an effect in the world that nobody finished agreeing to, and would
 * leave the other call in the journal with no result at all.
 *
 * The approved calls are executed here rather than handed back to the model, because what
 * a human agreed to was those calls with those arguments. Everything after them is an
 * ordinary turn: the model reads the results and decides what to do next.
 */
export class DecideApprovalUseCase {
	public constructor(
		private readonly catalog: AgentCatalog,
		private readonly models: ModelResolver,
		private readonly sessions: SessionRepository,
		private readonly runs: AgentRunFactory,
		private readonly scopes: RunScopeFactory,
		private readonly journal: RunJournal,
		private readonly executor: TurnExecutor,
		private readonly loop: TurnLoop,
		private readonly settler: RunSettler,
		private readonly results: RunResultFactory,
		private readonly sources: readonly ToolSource[] = [],
	) {}

	public async execute(
		sessionId: SessionId,
		callId: ToolCallId,
		decision: ApprovalDecision,
		options: ApprovalOptions = {},
	): Promise<AgentResult> {
		const { by, reason, sources: perRun = [], signal, actor, toolCalls } = options;
		const rehydrated = await this.sessions.rehydrate(SessionContext.fromSessionId(sessionId));
		if (rehydrated.state.pendingTurn?.isAwaiting(callId) !== true) {
			throw new ApprovalNotPendingError(sessionId.value, callId.value);
		}

		const definition = this.catalog.findOrFail(rehydrated.state.activeAgent ?? rehydrated.session.rootAgent);
		const model = this.models.resolve(definition);
		const started = this.runs.resume(sessionId, definition.name, rehydrated.state.pendingTurn.runId, signal);
		const sources = new ToolSourceScope(this.sources, perRun);
		const context = RunContext.fromOpenedSession(rehydrated.session, rehydrated.state, started.run, { signal, actor });
		const progress = new RunProgress(
			await this.sessions.commit(
				context,
				rehydrated.session.revision,
				new SessionEventBatch([
					this.journal.started(started, definition.name, model.descriptor().identity),
					this.journal.decision(
						started,
						callId,
						decision,
						by,
						reason,
						rehydrated.state.pendingTurn.find(callId)?.toolName,
						actor?.id,
					),
				]),
				rehydrated.state,
			),
		);

		try {
			return await this.release(
				context.withMetadata(progress.state.metadata),
				definition,
				model,
				started,
				progress,
				sources,
				rehydrated.session,
				RunObservers.none().watchingTools(toolCalls),
			);
		} catch (error) {
			await this.settler.settle(context, progress.state, started, error);
			throw error;
		} finally {
			await sources.close(started.run.id);
			this.runs.finish(started.run);
		}
	}

	/** The turn runs when nobody is waiting on it anymore, and stays suspended until then. */
	private async release(
		context: RunContext,
		definition: AgentDefinition,
		model: LlmModel,
		started: StartedRun,
		progress: RunProgress,
		sources: ToolSourceScope,
		session: Session,
		observers: RunObservers,
	): Promise<AgentResult> {
		const turn = progress.state.pendingTurn;
		if (turn === undefined) throw new ApprovalNotPendingError(session.id.value, started.run.id.value);
		if (!turn.isDecided) return this.staySuspended(context, started, progress, turn);

		const remote = await sources.open(session.id, started.run.id, started.cancellation.signal);
		const scope = await this.scopes.create(context, definition, model, started, remote);
		const released = await this.executor.execute(scope, turn.calls, true, undefined, observers.tools);
		const running = await this.commit(scope, progress, released);

		await this.loop.run(running, new OpenedSession(session, progress.state, false), progress, observers);
		return await this.results.after(running.context, started, progress);
	}

	/** Somebody still has to answer, so this run ends the way the one before it did. */
	private async staySuspended(
		context: RunContext,
		started: StartedRun,
		progress: RunProgress,
		turn: PendingTurn,
	): Promise<AgentResult> {
		progress.advanced(
			await this.sessions.commit(
				context,
				progress.state.revision,
				this.journal.stillWaiting(started, turn),
				progress.state,
			),
		);
		progress.suspend();
		return await this.results.after(context, started, progress);
	}

	private async commit(scope: RunScope, progress: RunProgress, batch: SessionEventBatch): Promise<RunScope> {
		progress.advanced(await this.sessions.commit(scope.context, progress.state.revision, batch, progress.state));
		return scope.withMetadata(progress.state.metadata);
	}
}
