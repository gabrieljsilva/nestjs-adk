import type { IdGenerator } from "../../common/identity/id-generator";
import { SessionId } from "../../common/identity/session-id";
import type { ModelResolver } from "../../contracts/model-resolver";
import type { ToolSource } from "../../contracts/tool-source";
import type { AgentDefinition } from "../../domain/agent/agent-definition";
import { UnsupportedCapabilityError } from "../../domain/model/errors/unsupported-capability.error";
import type { LlmModel } from "../../domain/model/llm-model";
import { ModelCapability } from "../../domain/model/model-capability";
import type { AgentResult } from "../../domain/session/agent-result";
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
import type { RunResultFactory } from "./run-result-factory";
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
		private readonly results: RunResultFactory,
		private readonly sources: readonly ToolSource[] = [],
	) {}

	public async handle(command: AgentRunCommand, observers: RunObservers = RunObservers.none()): Promise<AgentResult> {
		const called = this.catalog.findOrFail(command.agent);
		const sessionId = command.input.sessionId ?? SessionId.from(this.ids.next());

		// Continuing a conversation reads it first, because the session is what knows who owns
		// it now. The read writes nothing, so a command a draining runtime is about to refuse
		// still creates nothing; a conversation that does not exist yet is not read at all.
		const existing = command.input.sessionId === undefined ? undefined : await this.opener.open(command, sessionId);
		const entry = existing === undefined ? called : this.ownerOf(existing, called);

		const started = this.runs.start(sessionId, entry.name, command.signal);
		const sources = new ToolSourceScope(this.sources, command.sources);
		try {
			// Both edges are checked before the session is touched, so a handover nobody declared
			// and a question nobody can look at leave no trace at all.
			const definition = command.transferTo === undefined ? entry : this.transfers.open(entry, command.transferTo);
			const model = command.model ?? this.models.resolve(definition);
			this.assertCanSee(command, model);

			const opened = existing ?? (await this.opener.open(command, sessionId));
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
	 * The agent this session belongs to, which is not always the one the caller reached for.
	 *
	 * A transfer moves ownership and the session is what remembers, so continuing a conversation
	 * lands on whoever owns it now. The handle an application called only decides anything when
	 * there is no session yet, and then it decides the root.
	 *
	 * This is what makes a handover mean something after the turn it happened in. Answering as
	 * the agent the caller named would let any code walk around the declared graph by holding a
	 * different handle, and would leave the owner recorded in the session disagreeing with the
	 * agent that just spoke, which is what a resumed approval reads.
	 */
	private ownerOf(opened: OpenedSession, called: AgentDefinition): AgentDefinition {
		const owner = opened.state.activeAgent ?? opened.session.rootAgent;
		return owner.equals(called.name) ? called : this.catalog.findOrFail(owner);
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
			const scope = await this.scopes.create(definition, model, started, remote, command.limits, opened.session.owner);
			await this.reportUnauthorized(scope, progress, sources);
			await this.loop.run(scope, opened, progress, observers);
			return await this.results.after(started, progress);
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
}
