import type { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

const SCHEMA_VERSION = 2;

export class ToolApprovalGranted extends SessionEvent {
	public readonly type = ToolApprovalGranted.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public static readonly TYPE = "tool.approval-granted";

	public constructor(
		header: EventHeader,
		public readonly callId: ToolCallId,
		public readonly decidedBy: string | undefined,
		public readonly actorId?: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
