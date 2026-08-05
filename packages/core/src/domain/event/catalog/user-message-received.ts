import type { AttachmentReference } from "../../model/attachment-reference";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** The version that started recording a link as an attachment, next to a stored one. */
const SCHEMA_VERSION = 3;

/**
 * The user sent a message into the session.
 *
 * Attachments are recorded as names, never as bytes: an id for what was written to
 * artifact storage, an address for what already lived somewhere else. The journal is read
 * on every rehydration, every status check and every projection, while the image itself is
 * only looked at when a prompt is being built.
 */
export class UserMessageReceived extends SessionEvent {
	public readonly type = UserMessageReceived.TYPE;
	public readonly schemaVersion = EventSchemaVersion.of(SCHEMA_VERSION);

	public static readonly TYPE = "session.user-message-received";

	public constructor(
		header: EventHeader,
		public readonly text: string,
		public readonly attachments: readonly AttachmentReference[] = [],
	) {
		super(header.id, header.occurredAt, header.correlation);
	}

	public get hasAttachments(): boolean {
		return this.attachments.length > 0;
	}
}
