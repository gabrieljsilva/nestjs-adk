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

/**
 * One command, from the session it belongs to through to the fact that it ended.
 *
 * The order is the whole design. The run is registered before storage is touched, so a
 * draining runtime never creates a session for a command it is about to refuse. What the
 * user said is journaled before anything else can fail, so a run that dies opening a tool
 * source leaves the question recorded and an ending recorded after it. And the run leaves
 * the active set however it settles, so a shutdown draining on it is not waiting on
 * something already over.
 */
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

	/** The question becomes durable here, and everything after it is recorded whatever happens. */
	private async executeInSession(
		command: AgentRunCommand,
		entry: RunEntry,
		started: StartedRun,
		sources: ToolSourceScope,
		observers: RunObservers,
	): Promise<AgentResult> {
		// Both edges are checked before the session is touched, so a handover nobody declared
		// and a question nobody can look at leave no trace at all.
		const handover = this.transfers.resolve(entry.agent, command.transferTo);
		const model = this.models.resolve(handover.definition, command.model, command.input);

		const opened = await this.opener.openEntry(command, entry);
		// Built once, here, from the session as it was opened plus what the command carried.
		const context = RunContext.fromOpenedSession(opened.session, opened.state, started.run, {
			signal: started.cancellation.signal,
			actor: command.actor,
		}).withActiveAgent(handover.definition.name);
		const attached = await this.attachments.store(context, command.input.attachments, command.input.references);
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

	/** From here on the run has a journal entry, so every ending it can reach gets recorded. */
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
