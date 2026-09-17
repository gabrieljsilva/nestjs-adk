import type { MetadataValue } from "../../../session/metadata/metadata-value";
import type { EventHeader } from "../../event-header";
import { EventSchemaVersion } from "../../event-schema-version";
import { SessionEvent } from "../../session-event";

/**
 * One piece of durable session metadata was written.
 *
 * Last write per key wins, so a key set twice in the same commit means the second value and
 * nothing is lost by replaying the journal in order. It rides on the commit of the turn that
 * asked for it, which is what makes a run that failed lose the write together with the turn.
 */
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
