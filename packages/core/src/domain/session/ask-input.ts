import type { SessionId } from "../../common/identity/session-id";
import type { AttachmentReference } from "../model/attachment-reference";
import { MediaTooLargeError } from "../model/errors/media-too-large.error";
import { MediaLimits } from "../model/media-limits";
import type { MediaPart } from "../model/media-part";
import { EmptyMessageError } from "./errors/empty-message.error";
import { SessionMetadata } from "./session-metadata";

/**
 * The command that starts a run.
 * The public surface accepts a plain literal for ergonomics; the adapter converts it
 * here, so nothing past the boundary deals with unvalidated input.
 */
export class AskInput {
	private constructor(
		public readonly message: string,
		public readonly sessionId: SessionId | undefined,
		/** What the user attached for the model to look at, in the order they attached it. */
		public readonly attachments: readonly MediaPart[],
		/** Names of files the application owns, resolved by it on every projection. */
		public readonly references: readonly AttachmentReference[],
		/** What the application wants written about the session, on the same commit as the question. */
		public readonly metadata: SessionMetadata = SessionMetadata.empty(),
	) {}

	public static of(message: string, sessionId?: SessionId): AskInput {
		return AskInput.with(message, [], sessionId);
	}

	/**
	 * A question with something attached to it.
	 *
	 * The words are still required: an attachment with nothing said about it leaves the
	 * model guessing what it is being asked, and every provider answers that badly.
	 *
	 * The size of each attachment was already settled when it was built. What is decided
	 * here is the only thing a single part cannot know, which is whether the set of them
	 * fits in one request. A reference carries no bytes, so it costs the total nothing.
	 */
	public static with(
		message: string,
		attachments: readonly MediaPart[],
		sessionId?: SessionId,
		limits: MediaLimits = MediaLimits.byDefault(),
		references: readonly AttachmentReference[] = [],
		metadata: SessionMetadata = SessionMetadata.empty(),
	): AskInput {
		const trimmed = message.trim();
		if (trimmed.length === 0) throw new EmptyMessageError();

		const total = attachments.reduce((sum, part) => sum + part.encodedBytes, 0);
		if (total > limits.maxTotalEncodedBytes) {
			throw new MediaTooLargeError("total", total, limits.maxTotalEncodedBytes);
		}
		return new AskInput(trimmed, sessionId, [...attachments], [...references], metadata);
	}

	public get hasAttachments(): boolean {
		return this.attachments.length > 0 || this.references.length > 0;
	}

	public get continuesSession(): boolean {
		return this.sessionId !== undefined;
	}
}
