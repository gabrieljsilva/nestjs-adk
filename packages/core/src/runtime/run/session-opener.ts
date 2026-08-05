import type { SessionId } from "../../common/identity/session-id";
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
		return new OpenedSession(rehydrated.session, rehydrated.state, false);
	}

	private async start(command: AgentRunCommand, sessionId: SessionId): Promise<OpenedSession> {
		const session = Session.start(sessionId, command.agent, command.mode, this.clock.now(), command.owner);
		await this.sessions.create(session);
		return new OpenedSession(session, SessionState.initial(), true);
	}
}
