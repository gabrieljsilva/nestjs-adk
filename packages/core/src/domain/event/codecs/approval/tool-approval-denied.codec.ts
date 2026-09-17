import { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import { ToolApprovalDenied } from "../../catalog/approval/tool-approval-denied.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

const SCHEMA_VERSION = 3;

export class ToolApprovalDeniedCodec extends SessionEventCodec<ToolApprovalDenied> {
	public readonly type = ToolApprovalDenied.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public encode(event: ToolApprovalDenied): Record<string, unknown> {
		return {
			callId: event.callId.value,
			decidedBy: event.decidedBy ?? null,
			actorId: event.actorId ?? null,
			reason: event.reason,
			toolName: event.toolName,
		};
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): ToolApprovalDenied {
		return new ToolApprovalDenied(
			header,
			ToolCallId.from(this.readText(payload, "callId")),
			this.readOptionalText(payload, "decidedBy") ?? this.readOptionalText(payload, "deniedBy"),
			this.readText(payload, "reason"),
			this.readOptionalText(payload, "toolName") ?? "",
			this.readOptionalText(payload, "actorId"),
		);
	}
}
