import { SessionId } from "../../common/identity/session-id";
import { SessionOwner } from "./session-owner";

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
		public readonly owner: SessionOwner | undefined,
	) {}

	/**
	 * A session id may be the string an HTTP request carried, so it does not have to be
	 * parsed twice by the caller. Whatever shape it arrives in, nothing past this point
	 * deals with unvalidated input.
	 */
	public static of(sessionId?: SessionId | string, owner?: string): CreateSessionInput {
		return new CreateSessionInput(
			CreateSessionInput.idOf(sessionId),
			owner === undefined ? undefined : SessionOwner.from(owner),
		);
	}

	private static idOf(sessionId?: SessionId | string): SessionId | undefined {
		if (sessionId === undefined) return undefined;
		return sessionId instanceof SessionId ? sessionId : SessionId.from(sessionId);
	}
}
