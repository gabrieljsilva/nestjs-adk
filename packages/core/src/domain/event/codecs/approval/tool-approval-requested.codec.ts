import { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import { ToolApprovalRequested } from "../../catalog/approval/tool-approval-requested.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

export class ToolApprovalRequestedCodec extends SessionEventCodec<ToolApprovalRequested> {
	public readonly type = ToolApprovalRequested.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: ToolApprovalRequested): Record<string, unknown> {
		return {
			callId: event.callId.value,
			toolName: event.toolName,
			effect: event.effect,
		};
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): ToolApprovalRequested {
		return new ToolApprovalRequested(
			header,
			ToolCallId.from(this.readText(payload, "callId")),
			this.readText(payload, "toolName"),
			this.readText(payload, "effect"),
		);
	}
}
