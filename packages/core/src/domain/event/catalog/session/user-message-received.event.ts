import type { AttachmentReference } from "../../../model/attachment/attachment-reference.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

/** The version that started naming the actor the question was asked with. */
const SCHEMA_VERSION = 5;

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
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public static readonly TYPE = "session.user-message-received";

	public constructor(
		header: EventHeader,
		public readonly text: string,
		public readonly attachments: readonly AttachmentReference[] = [],
		/** The id of whoever asked, and only the id: claims are read at the call, never replayed. */
		public readonly actorId?: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}

	public get hasAttachments(): boolean {
		return this.attachments.length > 0;
	}
}
