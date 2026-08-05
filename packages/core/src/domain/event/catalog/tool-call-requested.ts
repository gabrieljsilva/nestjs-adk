import type { ToolCallId } from "../../../common/identity/tool-call-id";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** The version that started keeping the opaque signature a provider hands back with a call. */
const SCHEMA_VERSION = 2;

/**
 * The model asked for one tool to run, with the arguments it chose.
 *
 * The signature is stored because some providers refuse the next turn without it, and a
 * conversation rebuilt from this journal has to be one they will still accept. Nothing here
 * reads it: it is the provider's token, kept verbatim and handed back verbatim.
 */
export class ToolCallRequested extends SessionEvent {
	public readonly type = ToolCallRequested.TYPE;
	public readonly schemaVersion = EventSchemaVersion.of(SCHEMA_VERSION);

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
