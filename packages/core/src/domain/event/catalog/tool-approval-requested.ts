import type { ToolCallId } from "../../../common/identity/tool-call-id";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/**
 * One tool call was held back and now waits for a human decision.
 *
 * It is the notification, one per held call, and not the record of what has to run: the
 * suspension that follows carries the whole turn, arguments included, so nothing here has
 * to repeat them.
 */
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
