import type { ContentDigest } from "../../../../common/digest/content-digest.value-object";
import type { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

/** The version that started naming the call whose result carries the content. */
const SCHEMA_VERSION = 2;

/**
 * A skill became active for a run or for the whole session, pinned to the exact content it carried.
 *
 * The call it names is the one whose result holds the content. That is what makes the
 * activation more than a note: the context can protect the exact exchange the skill
 * arrived in, instead of the content being dropped by compaction while a marker saying it
 * is active survives.
 */
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

	/** Whether the skill is still loaded, which for a run scoped one means inside that run. */
	public isActiveIn(runId: string): boolean {
		return this.scope === "session" || this.correlation.runId.value === runId;
	}
}
