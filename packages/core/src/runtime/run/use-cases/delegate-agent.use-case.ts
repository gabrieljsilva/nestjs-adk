import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { ModelResolver } from "../../../contracts/model/model-resolver.contract";
import { DelegationNotDeclaredError } from "../../../domain/agent/errors/delegation-not-declared.error";
import { RunContext } from "../../../domain/run/run-context.value-object";
import { SessionContext } from "../../../domain/run/session-context.value-object";
import { PendingCall } from "../../../domain/session/approval/pending-call.value-object";
import type { DelegateInput } from "../../../domain/session/input/delegate-input.command";
import type { AgentResult } from "../../../domain/session/run/agent-result.value-object";
import type { AgentCatalog } from "../../catalog/agent-catalog.service";
import { DelegateToAgentTool } from "../../delegation/delegate-to-agent.tool";
import type { DelegationRunner } from "../../delegation/delegation-runner.service";
import { OpenedSession } from "../../session/opened-session.value-object";
import type { SessionManager } from "../../session/session-manager.service";
import type { AgentRunFactory } from "../agent-run.factory";
import type { RunScopeFactory } from "../scope/run-scope.factory";
import { RunProgress } from "../settle/run-progress.value-object";
import type { RunResultFactory } from "../settle/run-result.factory";
import type { RunSettler } from "../settle/run-settler.service";

/**
 * A delegation the application asked for, on a session that already exists.
 *
 * It is the code side of `delegate_to_agent`, and it goes through the same gate, the same
 * events and the same depth cap. The conversation stays with whoever owned it: what comes
 * back is the specialist's answer, not a change of who is answering.
 *
 * There is a parent run because a delegation is always inside one. Here the parent is a run
 * that exists only to own the delegation, which is what keeps the journal readable: a child
 * with no parent would be a run nobody asked for.
 */
export class DelegateAgent {
	public constructor(
		private readonly catalog: AgentCatalog,
		private readonly models: ModelResolver,
		private readonly sessions: SessionManager,
		private readonly runs: AgentRunFactory,
		private readonly scopes: RunScopeFactory,
		private readonly delegations: DelegationRunner,
		private readonly settler: RunSettler,
		private readonly results: RunResultFactory,
	) {}

	public async handle(input: DelegateInput): Promise<AgentResult> {
		const parent = this.catalog.findOrFail(input.from);
		// Checked before a run exists, so a delegation nobody declared leaves the journal alone.
		if (!parent.delegation.allows(input.to)) {
			throw new DelegationNotDeclaredError(parent.name.value, input.to.value, parent.delegation.names);
		}
		const rehydrated = await this.sessions.rehydrate(SessionContext.fromSessionId(input.sessionId));
		const started = this.runs.start(input.sessionId, parent.name);
		const progress = new RunProgress(rehydrated.state);
		const opened = new OpenedSession(rehydrated.session, rehydrated.state, false);
		const context = RunContext.fromOpenedSession(rehydrated.session, rehydrated.state, started.run);

		try {
			const scope = await this.scopes.create(context, parent, this.models.resolve(parent), started);
			const answers = await this.delegations.runAll(scope, opened, progress, [this.callOf(input)]);
			return await this.results.answering(context, started, progress, answers.values().next().value ?? "");
		} catch (error) {
			await this.settler.settle(context, progress.state, started, error);
			throw error;
		} finally {
			this.runs.finish(started.run);
		}
	}

	/** The same call the model would have made, built from what the code asked for. */
	private callOf(input: DelegateInput): PendingCall {
		return new PendingCall(ToolCallId.from(`delegate-${input.to.value}`), DelegateToAgentTool.NAME, {
			agentName: input.to.value,
			task: input.task,
		});
	}
}
