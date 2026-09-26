import type { AttachmentProjection } from "../../domain/model/attachment/attachment-projection.value-object";
import type { AttachmentRequest } from "../../domain/model/attachment/attachment-request.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";

/**
 * The application's answer to what an attachment becomes, asked again on every projection.
 * Nothing a resolver returns is cached or journaled, except inside a compaction checkpoint,
 * which keeps whatever was answered when it was written. A resolver that throws does not end
 * the turn: the attachment is projected as a note saying it could not be resolved.
 */
export abstract class AttachmentResolver {
	public abstract resolve(context: RunContext, request: AttachmentRequest): Promise<AttachmentProjection>;
}
