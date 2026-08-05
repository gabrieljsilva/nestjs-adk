import { UserMessageReceived } from "../catalog/user-message-received";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Codec for the message the user sent into the session. */
export class UserMessageReceivedCodec extends SessionEventCodec<UserMessageReceived> {
	public readonly type = UserMessageReceived.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: UserMessageReceived): Record<string, unknown> {
		return { text: event.text };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): UserMessageReceived {
		return new UserMessageReceived(header, this.readText(payload, "text"));
	}
}
