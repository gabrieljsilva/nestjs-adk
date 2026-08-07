import type { ModelResolver } from "../../contracts/model-resolver";
import type { AgentDefinition } from "../../domain/agent/agent-definition";
import { AgentName } from "../../domain/agent/agent-name";
import { DelegationNotDeclaredError } from "../../domain/agent/errors/delegation-not-declared.error";
import { SessionEventBatch } from "../../domain/event/session-event-batch";
import type { LlmModel } from "../../domain/model/llm-model";
import { AgentMaxDelegationDepthError } from "../../domain/session/errors/agent-max-delegation-depth.error";
import type { PendingCall } from "../../domain/session/pending-call";
import type { AgentCatalog } from "../catalog/agent-catalog";
import type { AgentRunFactory } from "../run/agent-run-factory";
import type { RunJournal } from "../run/run-journal";
import { RunProgress } from "../run/run-progress";
import type { RunScope } from "../run/run-scope";
import type { RunScopeFactory } from "../run/run-scope-factory";
import type { StartedRun } from "../run/started-run";
import type { OpenedSession } from "../session/opened-session";
import type { SessionManager } from "../session/session-manager";
import { DelegateToAgentTool } from "./delegate-to-agent-tool";
import type { DelegatedTurnLoop } from "./delegated-turn-loop";
import { DelegationSuspendedError } from "./errors/delegation-suspended.error";
import { DelegationUnboundError } from "./errors/delegation-unbound.error";

/** Three levels of "ask somebody else" is a tree nobody can read, and each level multiplies the bill. */
const MAX_DEPTH = 3;

const COMPLETED = "completed";

/**
 * Runs one agent's question inside another agent's run.
 *
 * A delegation is a run, not a tool call: its own agent, model, tools, context and budget.
 * What makes it a delegation rather than a second conversation is that it happens inside
 * the parent's run, writes to the same journal, and hands its answer back as the result of
 * the call that asked for it.
 *
 * The active agent of the session never changes, which is the whole difference from a
 * transfer: whoever was answering is still answering, they just know one more thing.
 */
export class DelegationRunner {
	private loop?: DelegatedTurnLoop;

	public constructor(
		private readonly catalog: AgentCatalog,
		private readonly models: ModelResolver,
		private readonly runs: AgentRunFactory,
		private readonly scopes: RunScopeFactory,
		private readonly journal: RunJournal,
		private readonly sessions: SessionManager,
	) {}

	/**
	 * Closes the one cycle in the runtime graph: a delegation runs turns, and a turn may
	 * delegate. The composition binds it once, right after the loop exists.
	 */
	public uses(loop: DelegatedTurnLoop): void {
		this.loop = loop;
	}

	/**
	 * Runs every delegation this turn asked for, and answers each by the call that asked.
	 *
	 * They run before the turn's other tools rather than in call order. A delegation commits
	 * to the journal as it goes, and interleaving those commits with results the executor has
	 * not returned yet would put the parent's answers in the journal before the questions
	 * that produced them.
	 */
	public async runAll(
		scope: RunScope,
		opened: OpenedSession,
		progress: RunProgress,
		calls: readonly PendingCall[],
	): Promise<ReadonlyMap<string, string>> {
		const answers = new Map<string, string>();
		for (const call of calls) {
			const request = DelegateToAgentTool.requestIn(call.toolName, call.args);
			if (request === undefined) continue;
			answers.set(call.callId.value, await this.run(scope, opened, progress, request.agentName, request.task));
		}
		return answers;
	}

	/**
	 * Refusals happen before a child run exists. An undeclared target and a chain that is
	 * already too deep both leave the journal untouched, because a delegation that never
	 * started is not something that happened to the conversation.
	 */
	private async run(
		scope: RunScope,
		opened: OpenedSession,
		progress: RunProgress,
		agentName: string,
		task: string,
	): Promise<string> {
		const target = this.targetOf(scope.definition, AgentName.from(agentName));
		if (scope.run.depth >= MAX_DEPTH) throw new AgentMaxDelegationDepthError(scope.agent.value, MAX_DEPTH);

		// Resolved once and carried: a resolver that answers by load, cost or time may answer
		// twice differently, and journaling one model while another serves the turn makes the
		// record of what happened disagree with what happened.
		const model = this.models.resolve(target);
		const child = this.runs.delegate(scope.started, target.name, scope.run.correlationId);
		try {
			const childProgress = await this.open(scope, child, opened, progress, target, model, task);
			await this.loopOrFail().run(this.scopes.delegated(scope, child, target, model), opened, childProgress);
			if (childProgress.isSuspended) {
				throw new DelegationSuspendedError(scope.agent.value, target.name.value);
			}
			await this.close(scope, child, opened, progress, childProgress);
			return childProgress.answer;
		} finally {
			this.runs.finish(child.run);
		}
	}

	private targetOf(from: AgentDefinition, to: AgentName): AgentDefinition {
		if (!from.delegation.allows(to)) {
			throw new DelegationNotDeclaredError(from.name.value, to.value, from.delegation.names);
		}
		return this.catalog.findOrFail(to);
	}

	/** The child's context begins here: the delegation is the parent's, the task is the child's. */
	private async open(
		scope: RunScope,
		child: StartedRun,
		opened: OpenedSession,
		progress: RunProgress,
		target: AgentDefinition,
		model: LlmModel,
		task: string,
	): Promise<RunProgress> {
		const state = await this.sessions.commit(
			opened.session.id,
			progress.state.revision,
			this.journal.delegation(scope.started, child, task, target.name, model.descriptor().identity),
			progress.state,
		);
		progress.advanced(state);
		return new RunProgress(state);
	}

	private async close(
		scope: RunScope,
		child: StartedRun,
		opened: OpenedSession,
		progress: RunProgress,
		childProgress: RunProgress,
	): Promise<void> {
		const closed = await this.sessions.commit(
			opened.session.id,
			childProgress.state.revision,
			SessionEventBatch.of([this.journal.delegationEnd(scope.started, child, COMPLETED)]),
			childProgress.state,
		);
		progress.advanced(closed);
	}

	private loopOrFail(): DelegatedTurnLoop {
		if (this.loop === undefined) throw new DelegationUnboundError();
		return this.loop;
	}
}
