import type { SessionId } from "../../common/identity/session-id";
import type { SessionRevision } from "../../common/revision/session-revision";
import type { AttachmentReference } from "./attachment-reference";
import type { MediaPart } from "./media-part";

/**
 * One attachment, asked about at the moment a context is being built.
 *
 * It carries what a resolver needs to answer per turn instead of forever: where the
 * attachment sits in the conversation (`revision`, `isCurrentRun`), and what the request
 * being assembled can carry (`acceptsRemoteUrl`). A provider that fetches media URLs
 * itself can be handed a fresh signed address; one that does not would receive it as a
 * dead string, so the resolver is told before it chooses.
 *
 * `load` is the runtime's own materialization, offered rather than imposed: the bytes it
 * stored for an artifact, the address a link recorded, nothing for an external id. A
 * resolver that wants today's behaviour calls it; one that wants something else ignores it.
 */
export class AttachmentRequest {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly reference: AttachmentReference,
		/** The revision of the event that brought this attachment into the session. */
		public readonly revision: SessionRevision,
		/** True when the attachment arrived in the run being served, false on a replay. */
		public readonly isCurrentRun: boolean,
		/** True when the model being served fetches a remote media URL by itself. */
		public readonly acceptsRemoteUrl: boolean,
		private readonly loader: () => Promise<MediaPart | undefined>,
	) {}

	/**
	 * What the runtime can bring back on its own: a stored artifact as bytes, a recorded
	 * link as its address, nothing for an external reference. Absence is an answer, not a
	 * failure, so an unreadable artifact resolves to nothing rather than throwing.
	 */
	public async load(): Promise<MediaPart | undefined> {
		return this.loader();
	}
}
