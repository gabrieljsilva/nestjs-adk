import { ToolSourceReauthRequired } from "../../catalog/tool/tool-source-reauth-required.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

export class ToolSourceReauthRequiredCodec extends SessionEventCodec<ToolSourceReauthRequired> {
	public readonly type = ToolSourceReauthRequired.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: ToolSourceReauthRequired): Record<string, unknown> {
		return { source: event.source, reason: event.reason };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): ToolSourceReauthRequired {
		return new ToolSourceReauthRequired(header, this.readText(payload, "source"), this.readText(payload, "reason"));
	}
}
