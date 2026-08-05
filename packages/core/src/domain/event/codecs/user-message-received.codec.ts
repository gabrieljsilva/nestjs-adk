import { ArtifactId } from "../../../common/identity/artifact-id";
import { UserMessageReceived } from "../catalog/user-message-received";
import { InvalidEventPayloadError } from "../errors/invalid-event-payload.error";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** The version that started recording what the user attached to the message. */
const SCHEMA_VERSION = 2;

/** Codec for the message the user sent into the session, with the ids of what came with it. */
export class UserMessageReceivedCodec extends SessionEventCodec<UserMessageReceived> {
	public readonly type = UserMessageReceived.TYPE;
	public readonly schemaVersion = EventSchemaVersion.of(SCHEMA_VERSION);

	public encode(event: UserMessageReceived): Record<string, unknown> {
		if (!event.hasAttachments) return { text: event.text };
		return { text: event.text, attachments: event.attachments.map((id) => id.value) };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): UserMessageReceived {
		return new UserMessageReceived(header, this.readText(payload, "text"), this.readAttachments(payload));
	}

	/** Absent means a message that had nothing attached, which is every message written before v2. */
	private readAttachments(payload: Readonly<Record<string, unknown>>): readonly ArtifactId[] {
		const value = payload.attachments;
		if (value === undefined || value === null) return [];
		if (!Array.isArray(value)) throw new InvalidEventPayloadError(this.type, "attachments", "expected an array.");
		return value.map((entry) => {
			if (typeof entry !== "string") {
				throw new InvalidEventPayloadError(this.type, "attachments", "expected an array of ids.");
			}
			return ArtifactId.from(entry);
		});
	}
}
