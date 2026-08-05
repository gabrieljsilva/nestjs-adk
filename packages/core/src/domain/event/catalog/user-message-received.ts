import type { ArtifactId } from "../../../common/identity/artifact-id";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** The version that started recording what the user attached to the message. */
const SCHEMA_VERSION = 2;

/**
 * The user sent a message into the session.
 *
 * Attachments are recorded as ids, never as bytes. The journal is read on every
 * rehydration, every status check and every projection, while the image itself is only
 * looked at when a prompt is being built, so the bytes live in artifact storage and this
 * keeps the names.
 */
export class UserMessageReceived extends SessionEvent {
	public readonly type = UserMessageReceived.TYPE;
	public readonly schemaVersion = EventSchemaVersion.of(SCHEMA_VERSION);

	public static readonly TYPE = "session.user-message-received";

	public constructor(
		header: EventHeader,
		public readonly text: string,
		public readonly attachments: readonly ArtifactId[] = [],
	) {
		super(header.id, header.occurredAt, header.correlation);
	}

	public get hasAttachments(): boolean {
		return this.attachments.length > 0;
	}
}
