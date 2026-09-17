import type { SessionId } from "../../common/identity/session-id.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { SessionInspection } from "../../domain/session/session-inspection.value-object";
import type { SessionRepository } from "./session-repository.service";

export class InspectSessionUseCase {
	public constructor(private readonly sessions: SessionRepository) {}

	public async execute(sessionId: SessionId): Promise<SessionInspection> {
		const rehydrated = await this.sessions.rehydrate(SessionContext.fromSessionId(sessionId));
		return SessionInspection.fromSession(rehydrated.session, rehydrated.state);
	}
}
