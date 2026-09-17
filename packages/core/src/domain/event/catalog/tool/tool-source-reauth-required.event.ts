import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

export class ToolSourceReauthRequired extends SessionEvent {
	public readonly type = ToolSourceReauthRequired.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "tool.source-reauth-required";

	public constructor(
		header: EventHeader,
		public readonly source: string,
		public readonly reason: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
