import type { AttachmentProjection } from "../domain/model/attachment-projection";
import type { AttachmentRequest } from "../domain/model/attachment-request";
import type { SessionContext } from "../domain/run/session-context";

/**
 * The application's answer to what an attachment becomes, each time a context is built.
 *
 * The journal records identity and never materialization: an id is durable, while bytes,
 * a signed address and relevance are all answers that hold for one turn. So the runtime
 * asks again on every projection, and this port is where the application answers, with
 * media, a line of text standing in for it, or nothing.
 *
 * Nothing a resolver returns is cached or recorded by the runtime: a URL signed for this
 * turn would be wrong on the next one, and only the application knows its TTL. The one
 * exception is a compaction checkpoint, which persists already projected blocks, so a
 * checkpointed turn keeps whatever this port answered when it was compacted. A resolver
 * that throws does not end the turn; the attachment is projected as a note saying it
 * could not be resolved, because a conversation is worth more than one missing image.
 *
 * `DefaultAttachmentResolver` is what runs when none is declared, and it is today's
 * behaviour: stored bytes come back inline, a link comes back as its address.
 */
export abstract class AttachmentResolver {
	public abstract resolve(context: SessionContext, request: AttachmentRequest): Promise<AttachmentProjection>;
}
