import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { AttachmentReference } from "../../model/attachment/attachment-reference.value-object";
import { MediaLimits } from "../../model/descriptor/media-limits.value-object";
import { MediaTooLargeError } from "../../model/errors/media-too-large.error";
import type { MediaPart } from "../../model/messages/media-part.value-object";
import { EmptyMessageError } from "../errors/empty-message.error";
import { SessionMetadata } from "../metadata/session-metadata.value-object";

/** What a question is made of, named rather than ordered. */
export interface AskInputParams {
	/**
	 * Always required, attachment or not: an image with nothing said about it leaves the model
	 * guessing what it is being asked, and every provider answers that badly.
	 */
	message: string;
	/** Continues a conversation; absent opens one. */
	sessionId?: SessionId;
	/** What the user attached for the model to look at, in the order they attached it. */
	attachments?: readonly MediaPart[];
	/** Names of files the application owns, resolved by it on every projection. */
	references?: readonly AttachmentReference[];
	/** What the application wants written about the session, on the same commit as the question. */
	metadata?: SessionMetadata;
	/**
	 * The ceiling the attachments are checked against as a set.
	 *
	 * Each part's own size was settled when it was built. What is decided here is the only
	 * thing a single part cannot know, which is whether all of them fit in one request. A
	 * reference carries no bytes, so it costs the total nothing.
	 */
	limits?: MediaLimits;
}

/**
 * The command that starts a run.
 * The public surface accepts a plain literal for ergonomics; the adapter converts it
 * here, so nothing past the boundary deals with unvalidated input.
 */
export class AskInput {
	public readonly message: string;
	public readonly sessionId: SessionId | undefined;
	public readonly attachments: readonly MediaPart[];
	public readonly references: readonly AttachmentReference[];
	public readonly metadata: SessionMetadata;

	public constructor(params: AskInputParams) {
		const trimmed = params.message.trim();
		if (trimmed.length === 0) throw new EmptyMessageError();
		const attachments = params.attachments ?? [];
		const limits = params.limits ?? MediaLimits.byDefault();
		const total = attachments.reduce((sum, part) => sum + part.encodedBytes, 0);
		if (total > limits.maxTotalEncodedBytes) {
			throw new MediaTooLargeError("total", total, limits.maxTotalEncodedBytes);
		}
		this.message = trimmed;
		this.sessionId = params.sessionId;
		this.attachments = [...attachments];
		this.references = [...(params.references ?? [])];
		this.metadata = params.metadata ?? SessionMetadata.empty();
	}

	/** The common case: words, and the conversation they continue. */
	public static fromMessage(message: string, sessionId?: SessionId): AskInput {
		return new AskInput({ message, sessionId });
	}

	public get hasAttachments(): boolean {
		return this.attachments.length > 0 || this.references.length > 0;
	}

	public get continuesSession(): boolean {
		return this.sessionId !== undefined;
	}
}
