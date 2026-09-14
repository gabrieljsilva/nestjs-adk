import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/**
 * One piece of durable session metadata was forgotten.
 *
 * Forgetting is a fact of its own rather than a value of `null`, because an application that
 * stores `null` deliberately means something by it and a reader could not tell the two apart.
 */
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
