import { ToolCallId } from "../../../common/identity/tool-call-id";
import { ToolApprovalRequested } from "../catalog/tool-approval-requested";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Codec for the pause that puts one tool call in front of a human. */
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
