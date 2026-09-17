import type { AttachmentReference } from "../../../model/attachment/attachment-reference.value-object";
import { UserMessageReceived } from "../../catalog/session/user-message-received.event";
import { InvalidEventPayloadError } from "../../errors/invalid-event-payload.error";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";
import { AttachmentReferenceCodec } from "../attachment-reference.codec";

/** Matches the event: version 5 is the one that names the actor the question was asked with. */
const SCHEMA_VERSION = 5;

/** Codec for the message the user sent into the session, with what came attached to it. */
export class UserMessageReceivedCodec extends SessionEventCodec<UserMessageReceived> {
	public readonly type = UserMessageReceived.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	private readonly attachments = new AttachmentReferenceCodec();

	public encode(event: UserMessageReceived): Record<string, unknown> {
		const actorId = event.actorId ?? null;
		if (!event.hasAttachments) return { text: event.text, actorId };
		return {
			text: event.text,
			actorId,
			attachments: event.attachments.map((reference) => this.attachments.encode(reference)),
		};
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): UserMessageReceived {
		return new UserMessageReceived(
			header,
			this.readText(payload, "text"),
			this.readAttachments(payload),
			// Absent before version 5, which recorded what was said without saying who said it.
			this.readOptionalText(payload, "actorId"),
		);
	}

	/** Absent means a message that had nothing attached, which is every message written before v2. */
	private readAttachments(payload: Readonly<Record<string, unknown>>): readonly AttachmentReference[] {
		const value = payload.attachments;
		if (value === undefined || value === null) return [];
		if (!Array.isArray(value)) throw new InvalidEventPayloadError(this.type, "attachments", "expected an array.");
		return value.map((entry) => {
			const reference = this.attachments.decode(entry);
			if (reference === undefined) {
				throw new InvalidEventPayloadError(this.type, "attachments", "expected an id or a link.");
			}
			return reference;
		});
	}
}
