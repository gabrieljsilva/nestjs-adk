import type { MetadataValue } from "../../../session/metadata/metadata-value.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

export class SessionMetadataSet extends SessionEvent {
	public readonly type = SessionMetadataSet.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "session.metadata-set";

	public constructor(
		header: EventHeader,
		public readonly key: string,
		public readonly value: MetadataValue,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
