import type { AttachmentReference } from "../../model/attachment-reference";
import { UserMessageReceived } from "../catalog/user-message-received";
import { InvalidEventPayloadError } from "../errors/invalid-event-payload.error";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";
import { AttachmentReferenceCodec } from "./attachment-reference.codec";

/** The version that started recording a link as an attachment, next to a stored one. */
const SCHEMA_VERSION = 3;

/** Codec for the message the user sent into the session, with what came attached to it. */
export class UserMessageReceivedCodec extends SessionEventCodec<UserMessageReceived> {
	public readonly type = UserMessageReceived.TYPE;
	public readonly schemaVersion = EventSchemaVersion.of(SCHEMA_VERSION);

	private readonly attachments = new AttachmentReferenceCodec();

	public encode(event: UserMessageReceived): Record<string, unknown> {
		if (!event.hasAttachments) return { text: event.text };
		return {
			text: event.text,
			attachments: event.attachments.map((reference) => this.attachments.encode(reference)),
		};
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): UserMessageReceived {
		return new UserMessageReceived(header, this.readText(payload, "text"), this.readAttachments(payload));
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
