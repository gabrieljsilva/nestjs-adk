import { AttachmentResolver } from "../../contracts/context/attachment-resolver";
import { AttachmentProjection } from "../../domain/model/attachment/attachment-projection";
import type { AttachmentRequest } from "../../domain/model/attachment/attachment-request";
import type { MediaPart } from "../../domain/model/messages/media-part";
import type { SessionContext } from "../../domain/run/session-context";

/**
 * Brings the bytes of one external attachment, or nothing when they are gone.
 * Building the `MediaPart` is the loader's job on purpose: `MediaPart.image` is where
 * type and size are validated, so what comes back is already something a request can carry.
 */
export type AttachmentContentLoader = (
	externalId: string,
	request: AttachmentRequest,
) => Promise<MediaPart | undefined>;

/**
 * Resolves an external attachment by fetching its bytes server side and inlining them.
 *
 * This is the resolver for development and for private files in general: the file store
 * is reached from this process, which can always see it, so no address ever travels and
 * nothing has to be reachable from the provider's network. A localhost MinIO works
 * exactly like production S3.
 *
 * A file the loader no longer finds becomes a note rather than silence, so the message
 * that mentioned it still reads coherently. Everything that is not external is what the
 * runtime already knows how to materialize, and is asked for as such.
 */
export class InlineAttachmentResolver extends AttachmentResolver {
	public constructor(private readonly loader: AttachmentContentLoader) {
		super();
	}

	public async resolve(_context: SessionContext, request: AttachmentRequest): Promise<AttachmentProjection> {
		const externalId = request.reference.externalId;
		if (externalId === undefined) {
			const stored = await request.load();
			return stored === undefined ? AttachmentProjection.omit() : AttachmentProjection.media(stored);
		}
		const part = await this.loader(externalId, request);
		if (part === undefined) return AttachmentProjection.noteFor(request.reference, "no longer available");
		return AttachmentProjection.media(part);
	}
}
