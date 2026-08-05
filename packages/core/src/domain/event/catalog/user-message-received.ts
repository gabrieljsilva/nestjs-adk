import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** The user sent a message into the session. */
export class UserMessageReceived extends SessionEvent {
	public readonly type = UserMessageReceived.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "session.user-message-received";

	public constructor(
		header: EventHeader,
		public readonly text: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
