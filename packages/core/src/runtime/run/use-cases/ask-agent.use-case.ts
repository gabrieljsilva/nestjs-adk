import type { IdGenerator } from "../../../common/identity/id-generator.contract";
import { SessionId } from "../../../common/identity/session-id.value-object";
import type { ModelResolver } from "../../../contracts/model/model-resolver.contract";
import type { ToolSource } from "../../../contracts/tool/tool-source.contract";
import type { AgentDefinition } from "../../../domain/agent/agent-definition.value-object";
import { ModelCapability } from "../../../domain/model/descriptor/model-capability.value-object";
import { UnsupportedCapabilityError } from "../../../domain/model/errors/unsupported-capability.error";
import type { LlmModel } from "../../../domain/model/llm-model.contract";
import { RunContext } from "../../../domain/run/run-context.value-object";
import type { AgentResult } from "../../../domain/session/run/agent-result.value-object";
import type { AttachmentStore } from "../../artifact/attachment-store.service";
import type { AgentCatalog } from "../../catalog/agent-catalog.service";
import type { OpenedSession } from "../../session/opened-session.value-object";
import type { SessionManager } from "../../session/session-manager.service";
import { ToolSourceScope } from "../../tool/tool-source-scope.service";

import type { TransferGate } from "../../transfer/transfer-gate.service";
import type { AgentRunCommand } from "../agent-run.command";
import type { AgentRunFactory } from "../agent-run.factory";
import type { RunJournal } from "../journal/run-journal.service";
import { RunObservers } from "../journal/run-observers.value-object";
import type { RunScopeFactory } from "../scope/run-scope.factory";
import type { RunScope } from "../scope/run-scope.value-object";
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
		const entry = existing === undefined ? called : this.resolveActiveAgent(existing, called);

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
			// Built once, here, from the session as it was opened plus what the command carried.
			const context = RunContext.fromOpenedSession(opened.session, opened.state, started.run, {
				signal: started.cancellation.signal,
				actor: command.actor,
			}).withActiveAgent(definition.name);
			const attached = await this.attachments.store(context, command.input.attachments, command.input.references);
			const progress = new RunProgress(
				await this.sessions.commit(
					context,
					opened.session.revision,
					this.journal.opening(started, definition.name, model.descriptor().identity, command, opened, from, attached),
					opened.state,
				),
			);
			return await this.execute(
				context.withMetadata(progress.state.metadata),
				definition,
				model,
				started,
				command,
				opened,
				progress,
				sources,
				observers.watchingTools(command.toolCalls),
			);
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
	 * different handle, and would leave the agent recorded in the session disagreeing with the
	 * agent that just spoke, which is what a resumed approval reads.
	 */
	private resolveActiveAgent(opened: OpenedSession, called: AgentDefinition): AgentDefinition {
		const active = opened.state.activeAgent ?? opened.session.rootAgent;
		return active.equals(called.name) ? called : this.catalog.findOrFail(active);
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
		context: RunContext,
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
			const scope = await this.scopes.create(context, definition, model, started, remote, command.limits);
			await this.reportUnauthorized(scope, progress, sources);
			await this.loop.run(scope, opened, progress, observers);
			return await this.results.after(scope.context, started, progress);
		} catch (error) {
			await this.settler.settle(context, progress.state, started, error);
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
				scope.context,
				progress.state.revision,
				this.journal.reauth(scope.started, sources.unauthorized),
				progress.state,
			),
		);
	}
}
