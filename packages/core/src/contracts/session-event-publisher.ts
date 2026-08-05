import type { SessionId } from "../common/identity/session-id";
import type { SessionEvent } from "../domain/event/session-event";
import type { StoredSessionEvent } from "../domain/event/stored-session-event";

/**
 * Where committed events go to be observed.
 *
 * Publication happens after the commit and never participates in it: an observer
 * that fails does not undo a journal that is already durable. Guaranteed delivery,
 * when an application needs it, is an outbox in the adapter, not a rollback here.
 */
export abstract class SessionEventPublisher {
	public abstract publish(committed: readonly StoredSessionEvent[]): Promise<void>;

	/**
	 * A fact that never reached the journal and never will.
	 *
	 * It exists for the facts worth knowing precisely because the journal refused them: a
	 * run that ended and could not record it is the one an observer most needs to hear
	 * about, and staying silent would leave it looking like a run still going.
	 */
	public abstract emit(sessionId: SessionId, event: SessionEvent): Promise<void>;
}
