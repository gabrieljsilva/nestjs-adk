import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { SessionRevision } from "../../../common/revision/session-revision.value-object";
import type { MediaPart } from "../messages/media-part.value-object";
import type { AttachmentReference } from "./attachment-reference.value-object";

/**
 * One attachment, asked about while a context is being built.
 * It carries what an `AttachmentResolver` needs to answer for this turn rather than
 * forever, and offers `load` rather than imposing it.
 */
export class AttachmentRequest {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly reference: AttachmentReference,
		public readonly revision: SessionRevision,
		public readonly isCurrentRun: boolean,
		public readonly acceptsRemoteUrl: boolean,
		private readonly loader: () => Promise<MediaPart | undefined>,
	) {}

	public async load(): Promise<MediaPart | undefined> {
		return this.loader();
	}
}
