import type { AttachmentReference } from "../../../model/attachment/attachment-reference.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

const SCHEMA_VERSION = 5;

export class UserMessageReceived extends SessionEvent {
	public readonly type = UserMessageReceived.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public static readonly TYPE = "session.user-message-received";

	public constructor(
		header: EventHeader,
		public readonly text: string,
		public readonly attachments: readonly AttachmentReference[] = [],
		public readonly actorId?: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}

	public get hasAttachments(): boolean {
		return this.attachments.length > 0;
	}
}
