import { SessionId } from "../../../common/identity/session-id.value-object";
import type { MetadataValue } from "../metadata/metadata-value.value-object";
import { SessionMetadata } from "../metadata/session-metadata.value-object";

/**
 * The command that opens a conversation before anything is asked in it, so an application
 * that already identifies its chats names the session itself.
 *
 * The identifier is optional: a caller that leaves it out reads it off the session it gets back.
 */
export class CreateSessionInput {
	private constructor(
		public readonly sessionId: SessionId | undefined,
		public readonly metadata: SessionMetadata,
	) {}

	public static fromOptions(
		sessionId?: SessionId | string,
		metadata: Readonly<Record<string, MetadataValue>> = {},
	): CreateSessionInput {
		return new CreateSessionInput(CreateSessionInput.readId(sessionId), SessionMetadata.fromRecord(metadata));
	}

	private static readId(sessionId?: SessionId | string): SessionId | undefined {
		if (sessionId === undefined) return undefined;
		return sessionId instanceof SessionId ? sessionId : SessionId.from(sessionId);
	}
}
