import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { RunContext } from "../../../domain/run/run-context.value-object";
import { SessionContext } from "../../../domain/run/session-context.value-object";
import { PendingCall } from "../../../domain/session/approval/pending-call.value-object";
import type { DelegateInput } from "../../../domain/session/input/delegate-input.command";
import type { AgentResult } from "../../../domain/session/run/agent-result.value-object";
import type { AgentCatalog } from "../../catalog/agent-catalog.service";
import { DelegateToAgentTool } from "../../delegation/delegate-to-agent.tool";
import type { DelegationRunner } from "../../delegation/delegation-runner.service";
import type { ModelService } from "../../model/model.service";
import { OpenedSession } from "../../session/opened-session.value-object";
import type { SessionRepository } from "../../session/session-repository.service";
import type { AgentRunFactory } from "../agent-run.factory";
import type { RunScopeFactory } from "../scope/run-scope.factory";
import { RunProgress } from "../settle/run-progress.value-object";
import type { RunResultFactory } from "../settle/run-result.factory";
import type { RunSettler } from "../settle/run-settler.service";

export class DelegateAgentUseCase {
	public constructor(
		private readonly catalog: AgentCatalog,
		private readonly models: ModelService,
		private readonly sessions: SessionRepository,
		private readonly runs: AgentRunFactory,
		private readonly scopes: RunScopeFactory,
		private readonly delegations: DelegationRunner,
		private readonly settler: RunSettler,
		private readonly results: RunResultFactory,
	) {}

	public async execute(input: DelegateInput): Promise<AgentResult> {
		const parent = this.catalog.findOrFail(input.from);
		this.delegations.assertDeclares(parent, input.to);
		const rehydrated = await this.sessions.rehydrate(SessionContext.fromSessionId(input.sessionId));
		const started = this.runs.start(input.sessionId, parent.name);
		const progress = new RunProgress(rehydrated.state);
		const opened = new OpenedSession(rehydrated.session, rehydrated.state, false);
		const context = RunContext.fromOpenedSession(rehydrated.session, rehydrated.state, started.run);

		return await this.runs.untilFinished(started, async () =>
			this.settler.settling(context, progress, started, async () => {
				const scope = await this.scopes.create(context, parent, this.models.resolve(parent), started);
				const answers = await this.delegations.runAll(scope, opened, progress, [this.buildCall(input)]);
				return await this.results.answering(context, started, progress, answers.values().next().value ?? "");
			}),
		);
	}

	private buildCall(input: DelegateInput): PendingCall {
		return new PendingCall(ToolCallId.from(`delegate-${input.to.value}`), DelegateToAgentTool.NAME, {
			agentName: input.to.value,
			task: input.task,
		});
	}
}
