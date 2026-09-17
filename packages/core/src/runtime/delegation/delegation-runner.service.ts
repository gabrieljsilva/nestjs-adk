import type { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { DelegationNotDeclaredError } from "../../domain/agent/errors/delegation-not-declared.error";
import { SessionEventBatch } from "../../domain/event/session-event-batch.value-object";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import type { PendingCall } from "../../domain/session/approval/pending-call.value-object";
import { AgentMaxDelegationDepthError } from "../../domain/session/errors/agent-max-delegation-depth.error";
import type { AgentCatalog } from "../catalog/agent-catalog.service";
import type { ModelService } from "../model/model.service";
import type { AgentRunFactory } from "../run/agent-run.factory";
import type { RunJournal } from "../run/journal/run-journal.service";
import type { RunScopeFactory } from "../run/scope/run-scope.factory";
import type { RunScope } from "../run/scope/run-scope.value-object";
import { RunProgress } from "../run/settle/run-progress.value-object";
import type { StartedRun } from "../run/settle/started-run.value-object";
import type { OpenedSession } from "../session/opened-session.value-object";
import type { SessionRepository } from "../session/session-repository.service";
import { DelegateToAgentTool } from "./delegate-to-agent.tool";
import type { DelegatedTurnLoop } from "./delegated-turn-loop.contract";
import { DelegationSuspendedError } from "./errors/delegation-suspended.error";
import { DelegationUnboundError } from "./errors/delegation-unbound.error";

const MAX_DEPTH = 3;

const COMPLETED = "completed";

export class DelegationRunner {
	private loop?: DelegatedTurnLoop;

	public constructor(
		private readonly catalog: AgentCatalog,
		private readonly models: ModelService,
		private readonly runs: AgentRunFactory,
		private readonly scopes: RunScopeFactory,
		private readonly journal: RunJournal,
		private readonly sessions: SessionRepository,
	) {}

	public uses(loop: DelegatedTurnLoop): void {
		this.loop = loop;
	}

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

	private async run(
		scope: RunScope,
		opened: OpenedSession,
		progress: RunProgress,
		agentName: string,
		task: string,
	): Promise<string> {
		const target = this.resolveTarget(scope.definition, AgentName.from(agentName));
		if (scope.run.depth >= MAX_DEPTH) throw new AgentMaxDelegationDepthError(scope.agent.value, MAX_DEPTH);

		const model = this.models.resolve(target);
		const child = this.runs.delegate(scope.started, target.name, scope.run.correlationId);
		try {
			const childProgress = await this.open(scope, child, opened, progress, target, model, task);
			const childScope = await this.scopes.delegated(scope, child, target, model);
			await this.loopOrFail().run(childScope, opened, childProgress);
			progress.charged(...childProgress.billed);
			if (childProgress.isSuspended) {
				throw new DelegationSuspendedError(scope.agent.value, target.name.value);
			}
			await this.close(scope, child, opened, progress, childProgress);
			return childProgress.answer;
		} finally {
			this.runs.finish(child.run);
		}
	}

	public assertDeclares(from: AgentDefinition, to: AgentName): void {
		if (!from.delegation.allows(to)) {
			throw new DelegationNotDeclaredError(from.name.value, to.value, from.delegation.names);
		}
	}

	private resolveTarget(from: AgentDefinition, to: AgentName): AgentDefinition {
		if (!from.delegation.allows(to)) {
			throw new DelegationNotDeclaredError(from.name.value, to.value, from.delegation.names);
		}
		return this.catalog.findOrFail(to);
	}

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
			scope.context,
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
			scope.context,
			childProgress.state.revision,
			new SessionEventBatch([this.journal.delegationEnd(scope.started, child, COMPLETED)]),
			childProgress.state,
		);
		progress.advanced(closed);
	}

	private loopOrFail(): DelegatedTurnLoop {
		if (this.loop === undefined) throw new DelegationUnboundError();
		return this.loop;
	}
}
