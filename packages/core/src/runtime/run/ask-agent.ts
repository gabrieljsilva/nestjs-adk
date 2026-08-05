import type { IdGenerator } from "../../common/identity/id-generator";
import { SessionId } from "../../common/identity/session-id";
import type { ModelResolver } from "../../contracts/model-resolver";
import type { ToolSource } from "../../contracts/tool-source";
import type { AgentDefinition } from "../../domain/agent/agent-definition";
import { UnsupportedCapabilityError } from "../../domain/model/errors/unsupported-capability.error";
import type { LlmModel } from "../../domain/model/llm-model";
import { ModelCapability } from "../../domain/model/model-capability";
import { AgentResult } from "../../domain/session/agent-result";
import { AgentRunStatus } from "../../domain/session/agent-run-status";
import type { AttachmentStore } from "../artifact/attachment-store";
import type { AgentCatalog } from "../catalog/agent-catalog";
import type { OpenedSession } from "../session/opened-session";
import type { SessionManager } from "../session/session-manager";
import { ToolSourceScope } from "../tool/tool-source-scope";

import type { TransferGate } from "../transfer/transfer-gate";
import type { AgentRunCommand } from "./agent-run-command";
import type { AgentRunFactory } from "./agent-run-factory";
import type { RunJournal } from "./run-journal";
import { RunObservers } from "./run-observers";
import { RunProgress } from "./run-progress";
import type { RunScope } from "./run-scope";
import type { RunScopeFactory } from "./run-scope-factory";
import type { RunSettler } from "./run-settler";
import type { SessionOpener } from "./session-opener";
import type { StartedRun } from "./started-run";
import type { TurnLoop } from "./turn-loop";

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
export class AskAgent {
	public constructor(
		private readonly catalog: AgentCatalog,
		private readonly models: ModelResolver,
		private readonly opener: SessionOpener,
		private readonly sessions: SessionManager,
		private readonly runs: AgentRunFactory,
		private readonly scopes: RunScopeFactory,
		private readonly journal: RunJournal,
		private readonly loop: TurnLoop,
		private readonly settler: RunSettler,
		private readonly transfers: TransferGate,
		private readonly ids: IdGenerator,
		private readonly attachments: AttachmentStore,
		private readonly sources: readonly ToolSource[] = [],
	) {}

	public async handle(command: AgentRunCommand, observers: RunObservers = RunObservers.none()): Promise<AgentResult> {
		const entry = this.catalog.findOrFail(command.agent);
		const sessionId = command.input.sessionId ?? SessionId.from(this.ids.next());

		const started = this.runs.start(sessionId, entry.name);
		const sources = new ToolSourceScope(this.sources);
		try {
			// Both edges are checked before the session is touched, so a handover nobody declared
			// and a question nobody can look at leave no trace at all.
			const definition = command.transferTo === undefined ? entry : this.transfers.open(entry, command.transferTo);
			const model = command.model ?? this.models.resolve(definition);
			this.assertCanSee(command, model);

			const opened = await this.opener.open(command, sessionId);
			const from = command.transferTo === undefined ? undefined : entry.name;
			const attached = await this.attachments.store(opened.session.id, command.input.attachments);
			const progress = new RunProgress(
				await this.sessions.commit(
					opened.session.id,
					opened.session.revision,
					this.journal.opening(started, definition.name, model.descriptor().identity, command, opened, from, attached),
					opened.state,
				),
			);
			return await this.execute(definition, model, started, command, opened, progress, sources, observers);
		} finally {
			await sources.close(started.run.id);
			this.runs.finish(started.run);
		}
	}

	/**
	 * An attachment nobody can look at ends the command before it becomes history.
	 *
	 * This is configuration and not conversation: the application pointed an agent at a
	 * model that never declared media input and then handed it an image. Accepting the
	 * message would pay for a call that answers about nothing, and recording it would leave
	 * an image in the journal that this session can never use.
	 */
	private assertCanSee(command: AgentRunCommand, model: LlmModel): void {
		if (!command.input.hasAttachments) return;
		const descriptor = model.descriptor();
		if (descriptor.capabilities.supports(ModelCapability.MEDIA_INPUT)) return;
		throw new UnsupportedCapabilityError(descriptor.identity.toString(), ModelCapability.MEDIA_INPUT.name);
	}

	/** From here on the run has a journal entry, so every ending it can reach gets recorded. */
	private async execute(
		definition: AgentDefinition,
		model: LlmModel,
		started: StartedRun,
		command: AgentRunCommand,
		opened: OpenedSession,
		progress: RunProgress,
		sources: ToolSourceScope,
		observers: RunObservers,
	): Promise<AgentResult> {
		try {
			const remote = await sources.open(opened.session.id, started.run.id, started.cancellation.signal);
			const scope = this.scopes.create(definition, model, started, remote, command.limits);
			await this.reportUnauthorized(scope, progress, sources);
			await this.loop.run(scope, opened, progress, observers);
			return this.resultOf(started, progress);
		} catch (error) {
			await this.settler.settle(opened.session.id, progress.state, started, error);
			throw error;
		}
	}

	/**
	 * Records a source that would not let the runtime in, and lets the run carry on.
	 * A conversation with fewer tools is worth more than no conversation, and somebody
	 * still gets told that a credential has to be renewed.
	 */
	private async reportUnauthorized(scope: RunScope, progress: RunProgress, sources: ToolSourceScope): Promise<void> {
		if (sources.unauthorized.length === 0) return;
		progress.advanced(
			await this.sessions.commit(
				scope.sessionId,
				progress.state.revision,
				this.journal.reauth(scope.started, sources.unauthorized),
				progress.state,
			),
		);
	}

	private resultOf(started: StartedRun, progress: RunProgress): AgentResult {
		const status = progress.isSuspended ? AgentRunStatus.SUSPENDED : AgentRunStatus.COMPLETED;
		const awaiting = progress.state.pendingTurn?.awaiting ?? [];
		return new AgentResult(started.run.sessionId, started.run.id, status, progress.answer, awaiting);
	}
}
