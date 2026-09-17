import { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import { ToolCallRequested } from "../../catalog/tool/tool-call-requested.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

const SCHEMA_VERSION = 2;

export class ToolCallRequestedCodec extends SessionEventCodec<ToolCallRequested> {
	public readonly type = ToolCallRequested.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public encode(event: ToolCallRequested): Record<string, unknown> {
		const encoded: Record<string, unknown> = {
			callId: event.callId.value,
			toolName: event.toolName,
			args: event.args,
		};
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
