import { SessionMetadataDeleted } from "../../catalog/metadata/session-metadata-deleted.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

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
