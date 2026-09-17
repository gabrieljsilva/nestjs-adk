import type { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

const SCHEMA_VERSION = 2;

/**
 * The model asked for one tool to run, with the arguments it chose.
 *
 * `signature` is the provider's own opaque token, kept verbatim and handed back verbatim,
 * because some providers refuse the next turn without it.
 */
export class ToolCallRequested extends SessionEvent {
	public readonly type = ToolCallRequested.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public static readonly TYPE = "tool.call-requested";

	public constructor(
		header: EventHeader,
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly args: Record<string, unknown>,
		public readonly signature?: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
