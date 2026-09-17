import type { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

const SCHEMA_VERSION = 3;

export class ToolApprovalDenied extends SessionEvent {
	public readonly type = ToolApprovalDenied.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public static readonly TYPE = "tool.approval-denied";

	public constructor(
		header: EventHeader,
		public readonly callId: ToolCallId,
		public readonly decidedBy: string | undefined,
		public readonly reason: string,
		public readonly toolName = "",
		public readonly actorId?: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
