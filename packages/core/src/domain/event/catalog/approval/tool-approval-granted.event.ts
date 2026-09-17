import type { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

/** The version that names the actor who decided rather than free text about them. */
const SCHEMA_VERSION = 2;

/**
 * A held tool call was allowed to run.
 *
 * `decidedBy` is what a human typed or what an interface filled in, and `actorId` is the id
 * of the actor the decision was made with. They are kept apart because only the second one
 * means anything to a policy: the first is a label for an audit trail to show.
 */
export class ToolApprovalGranted extends SessionEvent {
	public readonly type = ToolApprovalGranted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.of(SCHEMA_VERSION);

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
