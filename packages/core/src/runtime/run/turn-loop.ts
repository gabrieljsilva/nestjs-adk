import type { PreparedModelContext } from "../../domain/context/prepared-model-context";
import type { SessionEventBatch } from "../../domain/event/session-event-batch";
import { EmptyModelResponseError } from "../../domain/model/errors/empty-model-response.error";
import type { ModelChunk } from "../../domain/model/model-chunk";
import { AgentMaxIterationsError } from "../../domain/session/errors/agent-max-iterations.error";
import { AgentMaxTransfersError } from "../../domain/session/errors/agent-max-transfers.error";
import type { SessionState } from "../../domain/session/session-state";
import type { ContextManager } from "../context/context-manager";
import { PrepareContextCommand } from "../context/prepare-context-command";
import { DelegatedTurnLoop } from "../delegation/delegated-turn-loop";
import type { DelegationRunner } from "../delegation/delegation-runner";
import { ContextPhotographer } from "../diagnostics/context-photographer";
import { ModelRunCommand } from "../model/model-run-command";
import type { ModelRunOutcome } from "../model/model-run-outcome";
import type { ModelRunner } from "../model/model-runner";
import type { OpenedSession } from "../session/opened-session";
import type { SessionManager } from "../session/session-manager";
import type { ChunkSink } from "../stream/chunk-sink";
import type { AgentSwitch } from "../transfer/agent-switch";
import type { ApprovalGate } from "./approval-gate";
import type { RunJournal } from "./run-journal";
import { RunObservers } from "./run-observers";
import type { RunProgress } from "./run-progress";
import type { RunScope } from "./run-scope";
import type { TurnExecutor } from "./turn-executor";

/** Two agents that each think the other should answer would hand a session back forever. */
const MAX_TRANSFERS = 8;

/**
 * Model, tools, model again, until the model stops asking for tools.
 *
 * Each iteration commits twice, and the split is deliberate: what the model asked for is
 * durable before any tool runs, so a process that dies mid tool leaves a call waiting for
 * its result rather than an effect nobody recorded.
 *
 * The loop ends three ways and each is an ending. The model answered and asked for
 * nothing; a call needs somebody to agree to it, and the run suspends; or something threw
 * and whoever owns the run records why. Nothing here decides how large a context may be
 * or which model answers: the context arrives prepared and the reroutes arrive decided.
 */
export class TurnLoop extends DelegatedTurnLoop {
	public constructor(
		private readonly context: ContextManager,
		private readonly turns: ModelRunner,
		private readonly sessions: SessionManager,
		private readonly journal: RunJournal,
		private readonly executor: TurnExecutor,
		private readonly gate: ApprovalGate,
		private readonly agents: AgentSwitch,
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
			const outcome = await this.consume(this.turns.stream(this.commandOf(current, prepared)), observers.chunks);
			const calls = outcome.response.toolCalls;
			const empty = outcome.response.isEmpty;
			if (outcome.response.hasText) progress.said(outcome.response.text);

			await this.commit(
				current,
				progress,
				this.journal.turn(current.started, outcome, prepared.composition.characters, calls.length === 0 && !empty),
			);

			// The usage is journaled first: what the provider charged for happened, whatever it answered.
			if (empty) throw new EmptyModelResponseError(current.agent.value, outcome.servedBy.toString());
			if (calls.length === 0) return;

			iterations += 1;
			if (!current.limits.allowsIteration(iterations)) {
				throw new AgentMaxIterationsError(current.agent.value, current.limits.maxIterations ?? iterations);
			}

			const turn = this.gate.screen(current.catalog, calls);
			if (this.gate.holdsAny(turn)) {
				await this.commit(current, progress, this.journal.suspension(current.started, turn));
				progress.suspend();
				return;
			}

			// Delegations commit as they run, so they happen before the results of this turn exist.
			const delegated = await this.delegations.runAll(current, opened, progress, turn);
			const batch = await this.executor.execute(current, turn, false, delegated);
			await this.commit(current, progress, batch);

			const target = this.agents.requestedIn(batch);
			if (target !== undefined) {
				transfers += 1;
				if (transfers > MAX_TRANSFERS) throw new AgentMaxTransfersError(current.agent.value, MAX_TRANSFERS);
				current = this.agents.to(current, target);
			}
		}
	}

	/**
	 * Drains the turn, handing every chunk to whoever is watching on the way past.
	 *
	 * A run with no sink drains exactly the same generator, so streaming is not a second
	 * path through the loop: there is one way a turn is produced, and watching it is
	 * optional. A chunk of a delegated run never reaches here, because the parent asked a
	 * question and is owed an answer, not the working out.
	 */
	private async consume(turn: AsyncGenerator<ModelChunk, ModelRunOutcome>, sink?: ChunkSink): Promise<ModelRunOutcome> {
		let step = await turn.next();
		while (step.done !== true) {
			sink?.emit(step.value);
			step = await turn.next();
		}
		return step.value;
	}

	private async commit(scope: RunScope, progress: RunProgress, batch: SessionEventBatch): Promise<void> {
		progress.advanced(await this.sessions.commit(scope.sessionId, progress.state.revision, batch, progress.state));
	}

	/** The size a provider reported for the previous turn is the only anchor this one has. */
	private async prepare(scope: RunScope, opened: OpenedSession, state: SessionState): Promise<PreparedModelContext> {
		// A measurement another provider produced says nothing about this one's window.
		const measured = state.lastPrompt?.takenBy(scope.model.descriptor().identity);
		return this.context.prepare(
			new PrepareContextCommand(
				opened.session.id,
				scope.model,
				scope.catalog.declarations(),
				undefined,
				scope.skills.instructions(scope.definition.instructions),
				scope.compaction,
				measured?.usage,
				measured?.characters,
				scope.run.id,
			),
		);
	}

	private commandOf(scope: RunScope, prepared: PreparedModelContext): ModelRunCommand {
		return new ModelRunCommand(
			scope.run.id,
			scope.agent,
			scope.model,
			prepared.request,
			scope.definition.failover,
			scope.signal,
		);
	}
}
