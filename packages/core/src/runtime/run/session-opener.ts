import type { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import type { Clock } from "../../common/time/clock";
import { SessionClosedError } from "../../domain/session/errors/session-closed.error";
import { Session } from "../../domain/session/session";
import { SessionState } from "../../domain/session/session-state";
import { OpenedSession } from "../session/opened-session";
import type { SessionManager } from "../session/session-manager";
import type { AgentRunCommand } from "./agent-run-command";

/**
 * Finds the session a command belongs to, or starts the one it needs.
 *
 * A command without a session id is a conversation beginning, and a command with one is a
 * conversation continuing, which are different enough to be told apart here rather than
 * inside a run. A session that no longer accepts commands is refused before anything is
 * written, because appending to a closed conversation is not something a caller can undo.
 *
 * A session id that names nothing is still refused. Opening a conversation is something a
 * caller asks for, through `CreateSession`, and inferring it from an unknown id would turn
 * a stale or mistyped identifier into a fresh conversation nobody notices.
 */
export class SessionOpener {
	public constructor(
		private readonly sessions: SessionManager,
		private readonly clock: Clock,
	) {}

	public async open(command: AgentRunCommand, sessionId: SessionId): Promise<OpenedSession> {
		if (command.input.sessionId === undefined) return this.start(command, sessionId);

		const rehydrated = await this.sessions.rehydrate(sessionId);
		if (!rehydrated.session.acceptsCommands) {
			throw new SessionClosedError(sessionId.value, rehydrated.session.status.toString());
		}
		return new OpenedSession(rehydrated.session, rehydrated.state, SessionOpener.isUnwritten(rehydrated.session));
	}

	private async start(command: AgentRunCommand, sessionId: SessionId): Promise<OpenedSession> {
		const session = Session.start(sessionId, command.agent, this.clock.now(), command.owner);
		await this.sessions.create(session);
		return new OpenedSession(session, SessionState.initial(), SessionOpener.isUnwritten(session));
	}

	/**
	 * Whether this session's journal is still empty, which is what decides if the run about
	 * to happen has to record the conversation beginning.
	 *
	 * It is read off the journal rather than remembered from who wrote the head, and that is
	 * the whole point: a session opened by `CreateSession` minutes earlier and one created by
	 * this very command are both at revision zero, and both need their first run to say so.
	 * It also covers the run that created a head and then failed before committing anything,
	 * which under the old reading could never record its own beginning.
	 */
	private static isUnwritten(session: Session): boolean {
		return !session.revision.isAfter(SessionRevision.initial());
	}
}
