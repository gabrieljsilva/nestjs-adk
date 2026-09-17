import type { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

export class ToolApprovalRequested extends SessionEvent {
	public readonly type = ToolApprovalRequested.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "tool.approval-requested";

	public constructor(
		header: EventHeader,
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly effect: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
