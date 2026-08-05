import { ToolCallId } from "../../../common/identity/tool-call-id";
import { ToolApprovalDenied } from "../catalog/tool-approval-denied";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Codec for the refusal that keeps one held tool call from running. */
export class ToolApprovalDeniedCodec extends SessionEventCodec<ToolApprovalDenied> {
	public readonly type = ToolApprovalDenied.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: ToolApprovalDenied): Record<string, unknown> {
		return { callId: event.callId.value, deniedBy: event.deniedBy ?? null, reason: event.reason };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): ToolApprovalDenied {
		return new ToolApprovalDenied(
			header,
			ToolCallId.from(this.readText(payload, "callId")),
			this.readOptionalText(payload, "deniedBy"),
			this.readText(payload, "reason"),
		);
	}
}
