import type { ToolCallId } from "../../../common/identity/tool-call-id";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** A held tool call was allowed to run. */
export class ToolApprovalGranted extends SessionEvent {
	public readonly type = ToolApprovalGranted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "tool.approval-granted";

	public constructor(
		header: EventHeader,
		public readonly callId: ToolCallId,
		public readonly approvedBy: string | undefined,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
