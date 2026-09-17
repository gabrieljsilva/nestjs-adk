import type { IdGenerator } from "../../common/identity/id-generator.contract";
import { SessionId } from "../../common/identity/session-id.value-object";
import type { Clock } from "../../common/time/clock.contract";
import type { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { SessionClosedError } from "../../domain/session/errors/session-closed.error";
import { Session } from "../../domain/session/session.entity";
import { SessionState } from "../../domain/session/state/session-state.value-object";
import type { AgentCatalog } from "../catalog/agent-catalog.service";
import { OpenedSession } from "../session/opened-session.value-object";
import type { SessionRepository } from "../session/session-repository.service";
import type { AgentRunCommand } from "./agent-run.command";
import { RunEntry } from "./run-entry.value-object";

export class SessionOpener {
	public constructor(
		private readonly sessions: SessionRepository,
		private readonly clock: Clock,
		private readonly catalog: AgentCatalog,
		private readonly ids: IdGenerator,
	) {}

	public async enter(command: AgentRunCommand): Promise<RunEntry> {
		const called = this.catalog.findOrFail(command.agent);
		const sessionId = command.input.sessionId ?? SessionId.from(this.ids.next());
		if (command.input.sessionId === undefined) return new RunEntry(sessionId, called);

		const opened = await this.open(command, sessionId);
		return new RunEntry(sessionId, this.resolveActiveAgent(opened, called), opened);
	}

	public async openEntry(command: AgentRunCommand, entry: RunEntry): Promise<OpenedSession> {
		return entry.session ?? (await this.open(command, entry.sessionId));
	}

	private resolveActiveAgent(opened: OpenedSession, called: AgentDefinition): AgentDefinition {
		const active = opened.state.activeAgent ?? opened.session.rootAgent;
		return active.equals(called.name) ? called : this.catalog.findOrFail(active);
	}

	public async open(command: AgentRunCommand, sessionId: SessionId): Promise<OpenedSession> {
		if (command.input.sessionId === undefined) return this.start(command, sessionId);

		const rehydrated = await this.sessions.rehydrate(SessionContext.fromSessionId(sessionId));
		if (!rehydrated.session.acceptsCommands) {
			throw new SessionClosedError(sessionId.value, rehydrated.session.status.toString());
		}
		return new OpenedSession(rehydrated.session, rehydrated.state, SessionOpener.isUnwritten(rehydrated.state));
	}

	private async start(command: AgentRunCommand, sessionId: SessionId): Promise<OpenedSession> {
		const session = Session.start(sessionId, command.agent, this.clock.now());
		await this.sessions.create(SessionContext.fromSession(session), session);
		return new OpenedSession(session, SessionState.initial(), true);
	}

	private static isUnwritten(state: SessionState): boolean {
		return state.activeAgent === undefined;
	}
}
