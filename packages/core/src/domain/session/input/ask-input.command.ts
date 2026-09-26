import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { ArtifactContent } from "../../artifact/artifact-content.value-object";
import type { AttachmentReference } from "../../model/attachment/attachment-reference.value-object";
import { MediaLimits } from "../../model/descriptor/media-limits.value-object";
import { MediaTooLargeError } from "../../model/errors/media-too-large.error";
import type { MediaPart } from "../../model/messages/media-part.value-object";
import { EmptyMessageError } from "../errors/empty-message.error";
import { SessionMetadata } from "../metadata/session-metadata.value-object";

/** What a question is made of, named rather than ordered. */
export interface AskInputParams {
	message: string;
	sessionId?: SessionId;
	attachments?: readonly MediaPart[];
	references?: readonly AttachmentReference[];
	files?: readonly ArtifactContent[];
	metadata?: SessionMetadata;
	limits?: MediaLimits;
}

/**
 * The command that starts a run.
 * An empty message throws `EmptyMessageError`, and attachments over the total ceiling throw
 * `MediaTooLargeError`, both here rather than anywhere past this boundary.
 */
export class AskInput {
	public readonly message: string;
	public readonly sessionId: SessionId | undefined;
	public readonly attachments: readonly MediaPart[];
	public readonly references: readonly AttachmentReference[];
	public readonly files: readonly ArtifactContent[];
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
		this.files = [...(params.files ?? [])];
		this.metadata = params.metadata ?? SessionMetadata.empty();
	}

	public static fromMessage(message: string, sessionId?: SessionId): AskInput {
		return new AskInput({ message, sessionId });
	}

	public get hasAttachments(): boolean {
		return this.attachments.length > 0 || this.references.length > 0 || this.files.length > 0;
	}

	public get hasMediaAttachments(): boolean {
		return (
			this.attachments.length > 0 ||
			this.references.some((reference) => reference.needsMediaInput) ||
			this.files.some((file) => file.mediaType.startsWith("image/"))
		);
	}

	public get continuesSession(): boolean {
		return this.sessionId !== undefined;
	}
}
