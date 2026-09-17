import { AttachmentResolver } from "../../contracts/context/attachment-resolver.contract";
import { AttachmentProjection } from "../../domain/model/attachment/attachment-projection.value-object";
import type { AttachmentRequest } from "../../domain/model/attachment/attachment-request.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";

/**
 * What runs when the application declared no resolver, which is today's behaviour.
 *
 * A stored artifact comes back inline, a link comes back as its address, and one that no
 * longer materializes is left out, exactly as before the port existed. The one thing it
 * cannot do is resolve an external reference: those name files only the application can
 * reach, so they project as a note naming the gap rather than vanishing, because an ask
 * that attached references without declaring a resolver is a wiring mistake somebody has
 * to be able to see.
 */
export class DefaultAttachmentResolver extends AttachmentResolver {
	public async resolve(_context: SessionContext, request: AttachmentRequest): Promise<AttachmentProjection> {
		if (request.reference.isExternal) {
			return AttachmentProjection.fromReference(request.reference, "no attachment resolver is configured");
		}
		const part = await request.load();
		return part === undefined ? AttachmentProjection.omit() : AttachmentProjection.media(part);
	}
}
