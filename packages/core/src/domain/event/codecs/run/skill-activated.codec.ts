import { ContentDigest } from "../../../../common/digest/content-digest.value-object";
import { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import { SkillActivated } from "../../catalog/run/skill-activated.event";
import { InvalidEventPayloadError } from "../../errors/invalid-event-payload.error";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

const SCHEMA_VERSION = 2;

export class SkillActivatedCodec extends SessionEventCodec<SkillActivated> {
	public readonly type = SkillActivated.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public encode(event: SkillActivated): Record<string, unknown> {
		return {
			skillName: event.skillName,
			scope: event.scope,
			contentDigest: { algorithm: event.contentDigest.algorithm, value: event.contentDigest.value },
			callId: event.callId.value,
		};
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): SkillActivated {
		const digest = this.readRecord(payload, "contentDigest");
		return new SkillActivated(
			header,
			this.readText(payload, "skillName"),
			this.readScope(payload),
			new ContentDigest(this.readText(digest, "algorithm"), this.readText(digest, "value")),
			ToolCallId.from(this.readText(payload, "callId")),
		);
	}

	private readScope(payload: Readonly<Record<string, unknown>>): "run" | "session" {
		const scope = this.readText(payload, "scope");
		if (scope !== "run" && scope !== "session") {
			throw new InvalidEventPayloadError(this.type, "scope", 'expected "run" or "session".');
		}
		return scope;
	}
}
