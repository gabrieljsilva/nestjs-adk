import { ToolCallId } from "../../../common/identity/tool-call-id";
import { ToolCallRequested } from "../catalog/tool-call-requested";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Matches the event: version 2 is the one that carries a signature. */
const SCHEMA_VERSION = 2;

/** Codec for the request that starts one tool call. */
export class ToolCallRequestedCodec extends SessionEventCodec<ToolCallRequested> {
	public readonly type = ToolCallRequested.TYPE;
	public readonly schemaVersion = EventSchemaVersion.of(SCHEMA_VERSION);

	public encode(event: ToolCallRequested): Record<string, unknown> {
		const encoded: Record<string, unknown> = {
			callId: event.callId.value,
			toolName: event.toolName,
			args: event.args,
		};
		// Absent rather than null: a call from a provider with no signature never had one.
		if (event.signature !== undefined) encoded.signature = event.signature;
		return encoded;
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): ToolCallRequested {
		return new ToolCallRequested(
			header,
			ToolCallId.from(this.readText(payload, "callId")),
			this.readText(payload, "toolName"),
			this.readRecord(payload, "args"),
			this.readOptionalText(payload, "signature"),
		);
	}
}
