import type { ToolCallId } from "../../../common/identity/tool-call-id";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** The version that started naming the tool that was refused. */
const SCHEMA_VERSION = 2;

/**
 * A held tool call was refused, and the run continues without it.
 *
 * The tool is named here and not only in the request that was held: a reader of this event
 * alone, an audit trail being the obvious one, would otherwise know that somebody refused
 * something without knowing what.
 */
export class ToolApprovalDenied extends SessionEvent {
	public readonly type = ToolApprovalDenied.TYPE;
	public readonly schemaVersion = EventSchemaVersion.of(SCHEMA_VERSION);

	public static readonly TYPE = "tool.approval-denied";

	public constructor(
		header: EventHeader,
		public readonly callId: ToolCallId,
		public readonly deniedBy: string | undefined,
		public readonly reason: string,
		public readonly toolName = "",
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
