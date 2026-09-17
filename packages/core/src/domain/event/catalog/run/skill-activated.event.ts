import type { ContentDigest } from "../../../../common/digest/content-digest.value-object";
import type { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

const SCHEMA_VERSION = 2;

export class SkillActivated extends SessionEvent {
	public readonly type = SkillActivated.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public static readonly TYPE = "skill.activated";

	public constructor(
		header: EventHeader,
		public readonly skillName: string,
		public readonly scope: "run" | "session",
		public readonly contentDigest: ContentDigest,
		public readonly callId: ToolCallId,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}

	public isActiveIn(runId: string): boolean {
		return this.scope === "session" || this.correlation.runId.value === runId;
	}
}
