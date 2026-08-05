import { ToolSourceReauthRequired } from "../catalog/tool-source-reauth-required";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Codec for a tool source that has to be authorized again. */
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
