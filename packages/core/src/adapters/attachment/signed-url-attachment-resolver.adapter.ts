import { AttachmentResolver } from "../../contracts/context/attachment-resolver.contract";
import { AttachmentProjection } from "../../domain/model/attachment/attachment-projection.value-object";
import type { AttachmentRequest } from "../../domain/model/attachment/attachment-request.value-object";
import { MediaLimits } from "../../domain/model/descriptor/media-limits.value-object";
import { MediaPart } from "../../domain/model/messages/media-part.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";

/** Mints a fresh address for one external attachment, or nothing when the file is gone. */
export type AttachmentUrlSigner = (externalId: string, request: AttachmentRequest) => Promise<string | undefined>;

/**
 * Resolves an external attachment into a signed URL, minted again on every projection, so a
 * short TTL is enough and nothing durable holds an address. It needs a provider that fetches
 * URLs itself; one that does not is given a note instead.
 *
 * The signer runs for every turn that can see the attachment, so it must be cheap. A
 * compaction checkpoint persists projected blocks, so prefer `InlineAttachmentResolver` when
 * checkpointed history must stay readable for longer than the TTL.
 */
export class SignedUrlAttachmentResolver extends AttachmentResolver {
	public constructor(
		private readonly signer: AttachmentUrlSigner,
		private readonly limits: MediaLimits = MediaLimits.byDefault(),
	) {
		super();
	}

	public async resolve(_context: RunContext, request: AttachmentRequest): Promise<AttachmentProjection> {
		const externalId = request.reference.externalId;
		if (externalId === undefined) {
			if (request.reference.isReadableArtifact) return AttachmentProjection.artifact();
			const stored = await request.load();
			return stored === undefined ? AttachmentProjection.omit() : AttachmentProjection.media(stored);
		}
		if (!request.acceptsRemoteUrl) {
			return AttachmentProjection.fromReference(request.reference, "the serving model cannot fetch a remote file");
		}
		const url = await this.signer(externalId, request);
		if (url === undefined) return AttachmentProjection.fromReference(request.reference, "no longer available");
		const mediaType = request.reference.mediaType ?? "";
		return AttachmentProjection.media(MediaPart.link(url, mediaType, this.limits));
	}
}
