import { SessionMetadata } from "../../../session/metadata/session-metadata.value-object";
import { SessionMetadataSet } from "../../catalog/metadata/session-metadata-set.event";
import { InvalidEventPayloadError } from "../../errors/invalid-event-payload.error";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

export class SessionMetadataSetCodec extends SessionEventCodec<SessionMetadataSet> {
	public readonly type = SessionMetadataSet.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: SessionMetadataSet): Record<string, unknown> {
		return { key: event.key, value: event.value };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): SessionMetadataSet {
		const value = payload.value;
		if (!SessionMetadata.isValue(value)) {
			throw new InvalidEventPayloadError(this.type, "value", "expected a JSON value.");
		}
		return new SessionMetadataSet(header, this.readText(payload, "key"), value);
	}
}
