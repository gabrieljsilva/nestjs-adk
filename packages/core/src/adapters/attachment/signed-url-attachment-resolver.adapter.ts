import { AttachmentResolver } from "../../contracts/context/attachment-resolver.contract";
import { AttachmentProjection } from "../../domain/model/attachment/attachment-projection.value-object";
import type { AttachmentRequest } from "../../domain/model/attachment/attachment-request.value-object";
import { MediaLimits } from "../../domain/model/descriptor/media-limits.value-object";
import { MediaPart } from "../../domain/model/messages/media-part.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";

/**
 * Mints a fresh address for one external attachment, or nothing when the file is gone.
 * The TTL only has to survive the turn being built, which is what makes a short one
 * finally correct: nothing durable ever holds the address.
 */
export type AttachmentUrlSigner = (externalId: string, request: AttachmentRequest) => Promise<string | undefined>;

/**
 * Resolves an external attachment into a signed URL, minted again on every projection.
 *
 * This is the production resolver for a store like S3: the journal keeps the id forever,
 * the address lives for minutes, and expiry stops mattering because nobody is ever handed
 * an old one. It only makes sense in front of a provider that fetches URLs itself, so a
 * model that does not is given a note instead of an address it would read as text.
 *
 * Two caveats worth knowing. The signer runs on every projection of every turn that can
 * see the attachment, so signing should be cheap, which for S3 it is: a local HMAC, no
 * network. And a compaction checkpoint persists already projected blocks, so a checkpointed
 * turn keeps the address it was projected with; prefer `InlineAttachmentResolver` when
 * checkpointed history must stay readable for longer than the TTL.
 */
export class SignedUrlAttachmentResolver extends AttachmentResolver {
	public constructor(
		private readonly signer: AttachmentUrlSigner,
		private readonly limits: MediaLimits = MediaLimits.byDefault(),
	) {
		super();
	}

	public async resolve(_context: SessionContext, request: AttachmentRequest): Promise<AttachmentProjection> {
		const externalId = request.reference.externalId;
		if (externalId === undefined) {
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
