import type { SessionId } from "../../common/identity/session-id.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { SessionInspection } from "../../domain/session/session-inspection.value-object";
import type { SessionRepository } from "./session-repository.service";

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
export class InspectSessionUseCase {
	public constructor(private readonly sessions: SessionRepository) {}

	public async execute(sessionId: SessionId): Promise<SessionInspection> {
		const rehydrated = await this.sessions.rehydrate(SessionContext.fromSessionId(sessionId));
		return SessionInspection.fromSession(rehydrated.session, rehydrated.state);
	}
}
