import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** A tool source refused the runtime and needs to be authorized again; the run went on. */
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
