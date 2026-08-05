import type { SessionId } from "../../common/identity/session-id";
import { EmptyMessageError } from "./errors/empty-message.error";

/**
 * The command that starts a run.
 * The public surface accepts a plain literal for ergonomics; the adapter converts it
 * here, so nothing past the boundary deals with unvalidated input.
 */
export class AskInput {
	private constructor(
		public readonly message: string,
		public readonly sessionId?: SessionId,
	) {}

	public static of(message: string, sessionId?: SessionId): AskInput {
		const trimmed = message.trim();
		if (trimmed.length === 0) throw new EmptyMessageError();
		return new AskInput(trimmed, sessionId);
	}

	public get continuesSession(): boolean {
		return this.sessionId !== undefined;
	}
}
