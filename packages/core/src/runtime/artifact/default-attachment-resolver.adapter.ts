import { AttachmentResolver } from "../../contracts/context/attachment-resolver.contract";
import { AttachmentProjection } from "../../domain/model/attachment/attachment-projection.value-object";
import type { AttachmentRequest } from "../../domain/model/attachment/attachment-request.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";

export class DefaultAttachmentResolver extends AttachmentResolver {
	public async resolve(_context: RunContext, request: AttachmentRequest): Promise<AttachmentProjection> {
		if (request.reference.isExternal) {
			return AttachmentProjection.fromReference(request.reference, "no attachment resolver is configured");
		}
		if (request.reference.isReadableArtifact) return AttachmentProjection.artifact();
		const part = await request.load();
		return part === undefined ? AttachmentProjection.omit() : AttachmentProjection.media(part);
	}
}
