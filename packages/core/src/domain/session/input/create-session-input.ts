import { SessionId } from "../../../common/identity/session-id";
import type { MetadataValue } from "../metadata/metadata-value";
import { SessionMetadata } from "../metadata/session-metadata";

/**
 * The command that opens a conversation before anything is asked in it.
 *
 * It exists because the identifier of a conversation is often not the runtime's to choose:
 * an application that already has a chat wants the chat to be the conversation, and having
 * to ask a question first only to learn what the runtime named it means the chat is born
 * without an identity and is reconciled afterwards.
 *
 * The identifier is optional even so. A caller that only wants the name before the first
 * question leaves it out and reads it off the session it gets back.
 */
export class CreateSessionInput {
	private constructor(
		public readonly sessionId: SessionId | undefined,
		/** What the application knows about this conversation, written as events on the first commit. */
		public readonly metadata: SessionMetadata,
	) {}

	/**
	 * A session id may be the string an HTTP request carried, so it does not have to be
	 * parsed twice by the caller. Metadata arrives as the literal an application writes
	 * inline. Whatever shape either arrives in, nothing past this point deals with
	 * unvalidated input.
	 */
	public static fromOptions(
		sessionId?: SessionId | string,
		metadata: Readonly<Record<string, MetadataValue>> = {},
	): CreateSessionInput {
		return new CreateSessionInput(CreateSessionInput.idOf(sessionId), SessionMetadata.fromRecord(metadata));
	}

	private static idOf(sessionId?: SessionId | string): SessionId | undefined {
		if (sessionId === undefined) return undefined;
		return sessionId instanceof SessionId ? sessionId : SessionId.from(sessionId);
	}
}
