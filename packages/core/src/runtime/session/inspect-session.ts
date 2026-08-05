import type { SessionId } from "../../common/identity/session-id";
import { SessionInspection } from "../../domain/session/session-inspection";
import type { SessionManager } from "./session-manager";

/**
 * Answers where a session stands, without running anything.
 *
 * It is the only read the runtime offers that is not part of executing something, and it
 * exists because the process that asks is often not the process that ran. A suspension is
 * durable and a screen is not: whoever has to decide reads this.
 *
 * Rehydration is the same road a run takes, snapshot and all, so an inspection and the
 * next command always agree about where the session is. A session that never existed is
 * refused rather than answered as empty, because an empty answer reads like a session
 * that has nothing pending.
 */
export class InspectSession {
	public constructor(private readonly sessions: SessionManager) {}

	public async handle(sessionId: SessionId): Promise<SessionInspection> {
		const rehydrated = await this.sessions.rehydrate(sessionId);
		return SessionInspection.of(rehydrated.session, rehydrated.state);
	}
}
