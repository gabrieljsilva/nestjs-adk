import { SessionMetadataDeleted } from "../catalog/session-metadata-deleted";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Codec for the fact that one metadata key was forgotten. */
export class SessionMetadataDeletedCodec extends SessionEventCodec<SessionMetadataDeleted> {
	public readonly type = SessionMetadataDeleted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: SessionMetadataDeleted): Record<string, unknown> {
		return { key: event.key };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): SessionMetadataDeleted {
		return new SessionMetadataDeleted(header, this.readText(payload, "key"));
	}
}
