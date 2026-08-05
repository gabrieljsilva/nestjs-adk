import type { ToolCallId } from "../../../common/identity/tool-call-id";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** The model asked for one tool to run, with the arguments it chose. */
export class ToolCallRequested extends SessionEvent {
	public readonly type = ToolCallRequested.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "tool.call-requested";

	public constructor(
		header: EventHeader,
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly args: Record<string, unknown>,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
