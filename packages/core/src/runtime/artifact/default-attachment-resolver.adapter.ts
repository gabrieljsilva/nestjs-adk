import { AttachmentResolver } from "../../contracts/context/attachment-resolver.contract";
import { AttachmentProjection } from "../../domain/model/attachment/attachment-projection.value-object";
import type { AttachmentRequest } from "../../domain/model/attachment/attachment-request.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";

export class DefaultAttachmentResolver extends AttachmentResolver {
	public async resolve(_context: SessionContext, request: AttachmentRequest): Promise<AttachmentProjection> {
		if (request.reference.isExternal) {
			return AttachmentProjection.fromReference(request.reference, "no attachment resolver is configured");
		}
		const part = await request.load();
		return part === undefined ? AttachmentProjection.omit() : AttachmentProjection.media(part);
	}
}
