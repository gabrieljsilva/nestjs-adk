import { ToolCallId } from "../../../common/identity/tool-call-id";
import { ToolCallRequested } from "../catalog/tool-call-requested";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Codec for the request that starts one tool call. */
export class ToolCallRequestedCodec extends SessionEventCodec<ToolCallRequested> {
	public readonly type = ToolCallRequested.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: ToolCallRequested): Record<string, unknown> {
		return { callId: event.callId.value, toolName: event.toolName, args: event.args };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): ToolCallRequested {
		return new ToolCallRequested(
			header,
			ToolCallId.from(this.readText(payload, "callId")),
			this.readText(payload, "toolName"),
			this.readRecord(payload, "args"),
		);
	}
}
