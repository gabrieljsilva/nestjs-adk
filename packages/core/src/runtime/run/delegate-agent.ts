import { ToolCallId } from "../../common/identity/tool-call-id";
import type { ModelResolver } from "../../contracts/model-resolver";
import { DelegationNotDeclaredError } from "../../domain/agent/errors/delegation-not-declared.error";
import { AgentResult } from "../../domain/session/agent-result";
import { AgentRunStatus } from "../../domain/session/agent-run-status";
import type { DelegateInput } from "../../domain/session/delegate-input";
import { PendingCall } from "../../domain/session/pending-call";
import type { AgentCatalog } from "../catalog/agent-catalog";
import { DelegateToAgentTool } from "../delegation/delegate-to-agent-tool";
import type { DelegationRunner } from "../delegation/delegation-runner";
import { OpenedSession } from "../session/opened-session";
import type { SessionManager } from "../session/session-manager";
import type { AgentRunFactory } from "./agent-run-factory";
import { RunProgress } from "./run-progress";
import type { RunScopeFactory } from "./run-scope-factory";
import type { RunSettler } from "./run-settler";

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
	) {}

	public async handle(input: DelegateInput): Promise<AgentResult> {
		const parent = this.catalog.findOrFail(input.from);
		// Checked before a run exists, so a delegation nobody declared leaves the journal alone.
		if (!parent.delegation.allows(input.to)) {
			throw new DelegationNotDeclaredError(parent.name.value, input.to.value, parent.delegation.names);
		}
		const rehydrated = await this.sessions.rehydrate(input.sessionId);
		const started = this.runs.start(input.sessionId, parent.name);
		const progress = new RunProgress(rehydrated.state);
		const opened = new OpenedSession(rehydrated.session, rehydrated.state, false);

		try {
			const scope = this.scopes.create(parent, this.models.resolve(parent), started);
			const answers = await this.delegations.runAll(scope, opened, progress, [this.callOf(input)]);
			return new AgentResult(
				input.sessionId,
				started.run.id,
				AgentRunStatus.COMPLETED,
				answers.values().next().value ?? "",
			);
		} catch (error) {
			await this.settler.settle(input.sessionId, progress.state, started, error);
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
