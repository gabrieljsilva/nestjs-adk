import { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import { ToolApprovalGranted } from "../../catalog/approval/tool-approval-granted.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

/** Matches the event: version 2 is the one that names the actor who decided. */
const SCHEMA_VERSION = 2;

/** Codec for the approval that releases one held tool call. */
export class ToolApprovalGrantedCodec extends SessionEventCodec<ToolApprovalGranted> {
	public readonly type = ToolApprovalGranted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.of(SCHEMA_VERSION);

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
			// Version 1 wrote the same label under `approvedBy` and knew nothing about an actor.
			this.readOptionalText(payload, "decidedBy") ?? this.readOptionalText(payload, "approvedBy"),
			this.readOptionalText(payload, "actorId"),
		);
	}
}
