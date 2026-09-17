import { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import { ToolApprovalGranted } from "../../catalog/approval/tool-approval-granted.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

const SCHEMA_VERSION = 2;

export class ToolApprovalGrantedCodec extends SessionEventCodec<ToolApprovalGranted> {
	public readonly type = ToolApprovalGranted.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public encode(event: ToolApprovalGranted): Record<string, unknown> {
		return {
			callId: event.callId.value,
			decidedBy: event.decidedBy ?? null,
			actorId: event.actorId ?? null,
		};
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): ToolApprovalGranted {
		return new ToolApprovalGranted(
			header,
			ToolCallId.from(this.readText(payload, "callId")),
			this.readOptionalText(payload, "decidedBy") ?? this.readOptionalText(payload, "approvedBy"),
			this.readOptionalText(payload, "actorId"),
		);
	}
}
