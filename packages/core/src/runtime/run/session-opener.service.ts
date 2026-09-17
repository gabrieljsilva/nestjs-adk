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

/**
 * Finds the session a command belongs to, or starts the one it needs.
 *
 * A command without a session id is a conversation beginning, and a command with one is a
 * conversation continuing, which are different enough to be told apart here rather than
 * inside a run. A session that no longer accepts commands is refused before anything is
 * written, because appending to a closed conversation is not something a caller can undo.
 *
 * A session id that names nothing is still refused. Opening a conversation is something a
 * caller asks for, through `CreateSessionUseCase`, and inferring it from an unknown id would turn
 * a stale or mistyped identifier into a fresh conversation nobody notices.
 */
export class SessionOpener {
	public constructor(
		private readonly sessions: SessionRepository,
		private readonly clock: Clock,
		private readonly catalog: AgentCatalog,
		private readonly ids: IdGenerator,
	) {}

	/**
	 * Where a command enters: the conversation it names and the agent that answers in it.
	 *
	 * Continuing a conversation reads it first, because the session is what knows who owns it
	 * now. The read writes nothing, so a command a draining runtime is about to refuse still
	 * creates nothing; a conversation that does not exist yet is not read at all, and the
	 * agent the caller reached for is the one that answers.
	 */
	public async enter(command: AgentRunCommand): Promise<RunEntry> {
		const called = this.catalog.findOrFail(command.agent);
		const sessionId = command.input.sessionId ?? SessionId.from(this.ids.next());
		if (command.input.sessionId === undefined) return new RunEntry(sessionId, called);

		const opened = await this.open(command, sessionId);
		return new RunEntry(sessionId, this.resolveActiveAgent(opened, called), opened);
	}

	/** The session the entry already read, or the one this command is about to begin. */
	public async openEntry(command: AgentRunCommand, entry: RunEntry): Promise<OpenedSession> {
		return entry.session ?? (await this.open(command, entry.sessionId));
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

	/**
	 * Whether this session's journal is still empty, which is what decides if the run about
	 * to happen has to record the conversation beginning.
	 *
	 * It is read off the projection rather than from the revision, and that is the whole
	 * point: a session opened by `CreateSessionUseCase` with metadata on it has a journal and still
	 * has no beginning, and only `SessionCreated` and a transfer ever name an active agent. It
	 * also covers the run that created a head and then failed before committing anything,
	 * which under a revision reading could never record its own beginning.
	 */
	private static isUnwritten(state: SessionState): boolean {
		return state.activeAgent === undefined;
	}
}
