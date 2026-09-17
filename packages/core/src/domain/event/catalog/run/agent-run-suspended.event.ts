import type { PendingCall } from "../../../session/approval/pending-call.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

const SCHEMA_VERSION = 2;

export class AgentRunSuspended extends SessionEvent {
	public readonly type = AgentRunSuspended.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public static readonly TYPE = "run.suspended";

	public constructor(
		header: EventHeader,
		public readonly reason: string,
		public readonly calls: readonly PendingCall[] = [],
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
