import type { AgentDefinition } from "../../../domain/agent/agent-definition.value-object";
import type { LlmModel } from "../../../domain/model/llm-model.contract";
import { RunContext } from "../../../domain/run/run-context.value-object";
import type { AgentResult } from "../../../domain/session/run/agent-result.value-object";
import type { AttachmentStore } from "../../artifact/attachment-store.service";
import type { ModelService } from "../../model/model.service";
import type { OpenedSession } from "../../session/opened-session.value-object";
import type { SessionRepository } from "../../session/session-repository.service";
import type { ToolSourceScope } from "../../tool/tool-source-scope.service";
import type { ToolService } from "../../tool/tool.service";
import type { TransferGate } from "../../transfer/transfer-gate.service";
import type { AgentRunCommand } from "../agent-run.command";
import type { AgentRunFactory } from "../agent-run.factory";
import type { RunJournal } from "../journal/run-journal.service";
import { RunObservers } from "../journal/run-observers.value-object";
import type { RunEntry } from "../run-entry.value-object";
import type { RunScopeFactory } from "../scope/run-scope.factory";
import type { SessionOpener } from "../session-opener.service";
import { RunProgress } from "../settle/run-progress.value-object";
import type { RunResultFactory } from "../settle/run-result.factory";
import type { RunSettler } from "../settle/run-settler.service";
import type { StartedRun } from "../settle/started-run.value-object";
import type { TurnLoop } from "../turn/turn-loop.service";

export class AskAgentUseCase {
	public constructor(
		private readonly opener: SessionOpener,
		private readonly models: ModelService,
		private readonly sessions: SessionRepository,
		private readonly runs: AgentRunFactory,
		private readonly scopes: RunScopeFactory,
		private readonly journal: RunJournal,
		private readonly loop: TurnLoop,
		private readonly settler: RunSettler,
		private readonly transfers: TransferGate,
		private readonly attachments: AttachmentStore,
		private readonly results: RunResultFactory,
		private readonly tools: ToolService,
	) {}

	public async execute(command: AgentRunCommand, observers: RunObservers = RunObservers.none()): Promise<AgentResult> {
		const entry = await this.opener.enter(command);
		const started = this.runs.start(entry.sessionId, entry.agent.name, command.signal);
		return await this.runs.untilFinished(started, async () =>
			this.tools.withSources(command.sources, started.run.id, async (sources) =>
				this.executeInSession(command, entry, started, sources, observers.watchingTools(command.toolCalls)),
			),
		);
	}

	private async executeInSession(
		command: AgentRunCommand,
		entry: RunEntry,
		started: StartedRun,
		sources: ToolSourceScope,
		observers: RunObservers,
	): Promise<AgentResult> {
		const handover = this.transfers.resolve(entry.agent, command.transferTo);
		const model = this.models.resolve(handover.definition, command.model, command.input);

		const opened = await this.opener.openEntry(command, entry);
		const context = RunContext.fromOpenedSession(opened.session, opened.state, started.run, {
			signal: started.cancellation.signal,
			actor: command.actor,
		}).withActiveAgent(handover.definition.name);
		const attached = await this.attachments.store(
			context,
			command.input.attachments,
			command.input.references,
			command.input.files,
		);
		const progress = new RunProgress(
			await this.sessions.commit(
				context,
				opened.session.revision,
				this.journal.opening(
					started,
					handover.definition.name,
					model.descriptor().identity,
					command,
					opened,
					handover.from,
					attached,
				),
				opened.state,
			),
		);
		const recorded = context.withMetadata(progress.state.metadata);
		return await this.settler.settling(recorded, progress, started, async () =>
			this.executeRecorded(recorded, command, handover.definition, model, started, opened, progress, sources, observers),
		);
	}

	private async executeRecorded(
		context: RunContext,
		command: AgentRunCommand,
		definition: AgentDefinition,
		model: LlmModel,
		started: StartedRun,
		opened: OpenedSession,
		progress: RunProgress,
		sources: ToolSourceScope,
		observers: RunObservers,
	): Promise<AgentResult> {
		const remote = await sources.open(opened.session.id, started.run.id, started.cancellation.signal);
		const scope = await this.scopes.create(context, definition, model, started, remote, command.limits);
		await this.tools.recordUnauthorized(scope, progress, sources);
		await this.loop.run(scope, opened, progress, observers);
		return await this.results.after(scope.context, started, progress);
	}
}
