import type { Session } from "../../domain/session/session.entity";
import type { SessionState } from "../../domain/session/state/session-state.value-object";

export class RehydratedSession {
	public constructor(
		public readonly session: Session,
		public readonly state: SessionState,
		public readonly replayedFromSnapshot: boolean,
	) {}
}
