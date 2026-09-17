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
import type { ContextManager } from "../../context/context-manager.service";
import { PrepareContextCommand } from "../../context/prepare-context.command";
import { DelegatedTurnLoop } from "../../delegation/delegated-turn-loop.contract";
import type { DelegationRunner } from "../../delegation/delegation-runner.service";
import { ContextPhotographer } from "../../diagnostics/context-photographer.service";
import type { ModelRunOutcome } from "../../model/model-run-outcome.value-object";
import { ModelRunCommand } from "../../model/model-run.command";
import type { ModelRunner } from "../../model/model-runner.service";
import type { OpenedSession } from "../../session/opened-session.value-object";
import type { SessionManager } from "../../session/session-manager.service";
import type { ChunkSink } from "../../stream/chunk-sink.contract";
import type { AgentSwitch } from "../../transfer/agent-switch.use-case";
import type { RunJournal } from "../journal/run-journal.service";
import { RunObservers } from "../journal/run-observers.value-object";
import type { RunScope } from "../scope/run-scope.value-object";
import type { RunProgress } from "../settle/run-progress.value-object";
import type { ApprovalGate } from "./approval-gate.service";
import type { TurnExecutor } from "./turn-executor.service";

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
			if (outcome.response.structuredOutput !== undefined) progress.answered(outcome.response.structuredOutput);

			current = await this.commit(
				current,
				progress,
				this.journal.turn(current.started, outcome, prepared.characters, calls.length === 0 && !empty),
			);
			// Billed to whoever served it, which after a reroute is not the model the agent declared.
			progress.charged(new BilledCall(outcome.servedBy, outcome.response.usage));

			// The usage is journaled first: what the provider charged for happened, whatever it answered.
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

			// Delegations commit as they run, so they happen before the results of this turn exist.
			const delegated = await this.delegations.runAll(current, opened, progress, turn);
			const batch = await this.executor.execute(current, turn, false, delegated, observers.tools);
			current = await this.commit(current, progress, batch);

			const target = this.agents.requestedIn(batch);
			if (target !== undefined) {
				transfers += 1;
				if (transfers > MAX_TRANSFERS) throw new AgentMaxTransfersError(current.agent.value, MAX_TRANSFERS);
				current = await this.agents.to(current, target);
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

	/**
	 * Tells whoever is watching what the model asked for, before any of it runs or suspends.
	 *
	 * It comes after the gate and not before, so the notice carries the verdict: an interface
	 * that draws a card for the call knows on the spot whether to draw a button on it.
	 */
	private async announce(scope: RunScope, turn: readonly PendingCall[], observer?: ToolCallObserver): Promise<void> {
		if (observer === undefined) return;
		for (const call of turn) {
			await observer.requested(scope.context, ToolCallNotice.of(call, scope.catalog.find(call.toolName)));
		}
	}

	/**
	 * Commits, and answers the scope the rest of the run reads from.
	 *
	 * A tool of this turn may have written session metadata, and the fold moves on the commit
	 * that carried it. Handing the new one back is what lets the next call of the same run see
	 * what the last one wrote, instead of a tool being the one component blind to its own write.
	 */
	private async commit(scope: RunScope, progress: RunProgress, batch: SessionEventBatch): Promise<RunScope> {
		progress.advanced(await this.sessions.commit(scope.context, progress.state.revision, batch, progress.state));
		return scope.withMetadata(progress.state.metadata);
	}

	/** The size a provider reported for the previous turn is the only anchor this one has. */
	private async prepare(scope: RunScope, opened: OpenedSession, state: SessionState): Promise<PreparedModelContext> {
		// A measurement another provider produced says nothing about this one's window.
		const measured = state.lastPrompt?.takenBy(scope.model.descriptor().identity);
		return this.context.prepare(
			new PrepareContextCommand(
				scope.context,
				scope.model,
				scope.catalog.declarations(),
				undefined,
				scope.skills.instructions(scope.instructions),
				scope.compaction,
				measured,
				scope.definition.outputSchema,
			),
		);
	}

	private commandOf(scope: RunScope, prepared: PreparedModelContext): ModelRunCommand {
		return new ModelRunCommand(
			scope.context,
			scope.run.id,
			scope.agent,
			scope.model,
			prepared.request,
			scope.definition.failover,
			scope.signal,
		);
	}
}
