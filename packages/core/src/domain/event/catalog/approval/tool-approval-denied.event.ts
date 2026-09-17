import type { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

/** The version that names the actor who decided rather than free text about them alone. */
const SCHEMA_VERSION = 3;

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
		public readonly decidedBy: string | undefined,
		public readonly reason: string,
		public readonly toolName = "",
		/** The id of whoever refused, and only the id, for the same reason an approval carries one. */
		public readonly actorId?: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
