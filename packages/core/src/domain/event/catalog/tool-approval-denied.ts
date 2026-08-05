import type { ToolCallId } from "../../../common/identity/tool-call-id";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** A held tool call was refused, and the run continues without it. */
export class ToolApprovalDenied extends SessionEvent {
	public readonly type = ToolApprovalDenied.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "tool.approval-denied";

	public constructor(
		header: EventHeader,
		public readonly callId: ToolCallId,
		public readonly deniedBy: string | undefined,
		public readonly reason: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
