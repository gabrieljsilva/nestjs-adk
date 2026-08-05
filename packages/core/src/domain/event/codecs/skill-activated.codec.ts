import { ContentDigest } from "../../../common/digest/content-digest";
import { ToolCallId } from "../../../common/identity/tool-call-id";
import { SkillActivated } from "../catalog/skill-activated";
import { InvalidEventPayloadError } from "../errors/invalid-event-payload.error";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** The version that started naming the call whose result carries the content. */
const SCHEMA_VERSION = 2;

/** Codec for the activation of a skill, with its digest kept as algorithm and value. */
export class SkillActivatedCodec extends SessionEventCodec<SkillActivated> {
	public readonly type = SkillActivated.TYPE;
	public readonly schemaVersion = EventSchemaVersion.of(SCHEMA_VERSION);

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
			ContentDigest.of(this.readText(digest, "algorithm"), this.readText(digest, "value")),
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
