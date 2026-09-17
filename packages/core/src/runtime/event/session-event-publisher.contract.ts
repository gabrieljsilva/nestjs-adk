import type { SessionEvent } from "../../domain/event/session-event.event";
import type { StoredSessionEvent } from "../../domain/event/stored-session-event.record";
import type { SessionContext } from "../../domain/run/session-context.value-object";

export abstract class SessionEventPublisher {
	public abstract publish(context: SessionContext, committed: readonly StoredSessionEvent[]): Promise<void>;

	public abstract emit(context: SessionContext, event: SessionEvent): Promise<void>;
}
