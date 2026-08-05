import { ToolCallId } from "../../../common/identity/tool-call-id";
import { ToolApprovalGranted } from "../catalog/tool-approval-granted";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Codec for the approval that releases one held tool call. */
export class ToolApprovalGrantedCodec extends SessionEventCodec<ToolApprovalGranted> {
	public readonly type = ToolApprovalGranted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: ToolApprovalGranted): Record<string, unknown> {
		return { callId: event.callId.value, approvedBy: event.approvedBy ?? null };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): ToolApprovalGranted {
		return new ToolApprovalGranted(
			header,
			ToolCallId.from(this.readText(payload, "callId")),
			this.readOptionalText(payload, "approvedBy"),
		);
	}
}
