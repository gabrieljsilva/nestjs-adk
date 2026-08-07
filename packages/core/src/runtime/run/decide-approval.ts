import type { SessionId } from "../../common/identity/session-id";
import type { ToolCallId } from "../../common/identity/tool-call-id";
import type { ModelResolver } from "../../contracts/model-resolver";
import type { ToolSource } from "../../contracts/tool-source";
import type { AgentDefinition } from "../../domain/agent/agent-definition";
import { SessionEventBatch } from "../../domain/event/session-event-batch";
import type { LlmModel } from "../../domain/model/llm-model";
import type { AgentResult } from "../../domain/session/agent-result";
import { ApprovalNotPendingError } from "../../domain/session/errors/approval-not-pending.error";
import type { ApprovalDecision } from "../../domain/session/pending-call";
import type { PendingTurn } from "../../domain/session/pending-turn";
import type { Session } from "../../domain/session/session";
import type { AgentCatalog } from "../catalog/agent-catalog";
import { OpenedSession } from "../session/opened-session";
import type { SessionManager } from "../session/session-manager";
import { ToolSourceScope } from "../tool/tool-source-scope";
import type { AgentRunFactory } from "./agent-run-factory";
import type { RunJournal } from "./run-journal";
import { RunProgress } from "./run-progress";
import type { RunResultFactory } from "./run-result-factory";
import type { RunScope } from "./run-scope";
import type { RunScopeFactory } from "./run-scope-factory";
import type { RunSettler } from "./run-settler";
import type { StartedRun } from "./started-run";
import type { TurnExecutor } from "./turn-executor";
import type { TurnLoop } from "./turn-loop";

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
export class DecideApproval {
	public constructor(
		private readonly catalog: AgentCatalog,
		private readonly models: ModelResolver,
		private readonly sessions: SessionManager,
		private readonly runs: AgentRunFactory,
		private readonly scopes: RunScopeFactory,
		private readonly journal: RunJournal,
		private readonly executor: TurnExecutor,
		private readonly loop: TurnLoop,
		private readonly settler: RunSettler,
		private readonly results: RunResultFactory,
		private readonly sources: readonly ToolSource[] = [],
	) {}

	public async handle(
		sessionId: SessionId,
		callId: ToolCallId,
		decision: ApprovalDecision,
		options: ApprovalOptions = {},
	): Promise<AgentResult> {
		const { by, reason, sources: perRun = [], signal } = options;
		const rehydrated = await this.sessions.rehydrate(sessionId);
		if (rehydrated.state.pendingTurn?.isAwaiting(callId) !== true) {
			throw new ApprovalNotPendingError(sessionId.value, callId.value);
		}

		const definition = this.catalog.findOrFail(rehydrated.state.activeAgent ?? rehydrated.session.rootAgent);
		const model = this.models.resolve(definition);
		const started = this.runs.resume(sessionId, definition.name, rehydrated.state.pendingTurn.runId, signal);
		const sources = new ToolSourceScope(this.sources, perRun);
		const progress = new RunProgress(
			await this.sessions.commit(
				sessionId,
				rehydrated.session.revision,
				SessionEventBatch.of([
					this.journal.started(started, definition.name, model.descriptor().identity),
					this.journal.decision(started, callId, decision, by, reason, rehydrated.state.pendingTurn.find(callId)?.toolName),
				]),
				rehydrated.state,
			),
		);

		try {
			return await this.release(definition, model, started, progress, sources, rehydrated.session);
		} catch (error) {
			await this.settler.settle(sessionId, progress.state, started, error);
			throw error;
		} finally {
			await sources.close(started.run.id);
			this.runs.finish(started.run);
		}
	}

	/** The turn runs when nobody is waiting on it anymore, and stays suspended until then. */
	private async release(
		definition: AgentDefinition,
		model: LlmModel,
		started: StartedRun,
		progress: RunProgress,
		sources: ToolSourceScope,
		session: Session,
	): Promise<AgentResult> {
		const turn = progress.state.pendingTurn;
		if (turn === undefined) throw new ApprovalNotPendingError(session.id.value, started.run.id.value);
		if (!turn.isDecided) return this.staySuspended(started, progress, turn);

		const remote = await sources.open(session.id, started.run.id, started.cancellation.signal);
		const scope = await this.scopes.create(definition, model, started, remote, undefined, session.owner);
		await this.commit(scope, progress, await this.executor.execute(scope, turn.calls, true));

		await this.loop.run(scope, new OpenedSession(session, progress.state, false), progress);
		return await this.results.after(started, progress);
	}

	/** Somebody still has to answer, so this run ends the way the one before it did. */
	private async staySuspended(started: StartedRun, progress: RunProgress, turn: PendingTurn): Promise<AgentResult> {
		progress.advanced(
			await this.sessions.commit(
				started.run.sessionId,
				progress.state.revision,
				this.journal.stillWaiting(started, turn),
				progress.state,
			),
		);
		progress.suspend();
		return await this.results.after(started, progress);
	}

	private async commit(scope: RunScope, progress: RunProgress, batch: SessionEventBatch): Promise<void> {
		progress.advanced(await this.sessions.commit(scope.sessionId, progress.state.revision, batch, progress.state));
	}
}
