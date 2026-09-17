import type { Session } from "../../domain/session/session.entity";
import type { SessionState } from "../../domain/session/state/session-state.value-object";

/** A session brought back from storage, with the state its journal implies. */
export class RehydratedSession {
	public constructor(
		public readonly session: Session,
		public readonly state: SessionState,
		public readonly replayedFromSnapshot: boolean,
	) {}
}
