import { AttachmentResolver } from "../../contracts/context/attachment-resolver.contract";
import { AttachmentProjection } from "../../domain/model/attachment/attachment-projection.value-object";
import type { AttachmentRequest } from "../../domain/model/attachment/attachment-request.value-object";
import type { MediaPart } from "../../domain/model/messages/media-part.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";

/** Brings the bytes of one external attachment, or nothing when they are gone. */
export type AttachmentContentLoader = (
	externalId: string,
	request: AttachmentRequest,
) => Promise<MediaPart | undefined>;

/**
 * Resolves an external attachment by fetching its bytes through the loader and inlining them.
 *
 * Use it when the file store is reachable from this process and not from the provider's
 * network: no address ever travels. A file the loader no longer finds becomes a note in the
 * message rather than silence.
 */
export class InlineAttachmentResolver extends AttachmentResolver {
	public constructor(private readonly loader: AttachmentContentLoader) {
		super();
	}

	public async resolve(_context: RunContext, request: AttachmentRequest): Promise<AttachmentProjection> {
		const externalId = request.reference.externalId;
		if (externalId === undefined) {
			if (request.reference.isReadableArtifact) return AttachmentProjection.artifact();
			const stored = await request.load();
			return stored === undefined ? AttachmentProjection.omit() : AttachmentProjection.media(stored);
		}
		const part = await this.loader(externalId, request);
		if (part === undefined) return AttachmentProjection.fromReference(request.reference, "no longer available");
		return AttachmentProjection.media(part);
	}
}
