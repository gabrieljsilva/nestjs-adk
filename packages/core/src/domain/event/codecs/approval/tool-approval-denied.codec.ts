import { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import { ToolApprovalDenied } from "../../catalog/approval/tool-approval-denied.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

/** Matches the event: version 3 is the one that names the actor who refused. */
const SCHEMA_VERSION = 3;

/** Codec for the refusal that keeps one held tool call from running. */
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
			// Versions 1 and 2 wrote the same label under `deniedBy` and knew nothing about an actor.
			this.readOptionalText(payload, "decidedBy") ?? this.readOptionalText(payload, "deniedBy"),
			this.readText(payload, "reason"),
			// Absent in version 1, which recorded a refusal without saying what was refused.
			this.readOptionalText(payload, "toolName") ?? "",
			this.readOptionalText(payload, "actorId"),
		);
	}
}
