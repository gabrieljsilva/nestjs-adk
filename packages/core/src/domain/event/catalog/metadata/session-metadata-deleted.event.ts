import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

export class SessionMetadataDeleted extends SessionEvent {
	public readonly type = SessionMetadataDeleted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "session.metadata-deleted";

	public constructor(
		header: EventHeader,
		public readonly key: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
