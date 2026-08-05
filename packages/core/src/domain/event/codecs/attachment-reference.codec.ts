import { ArtifactId } from "../../../common/identity/artifact-id";
import { AttachmentReference } from "../../model/attachment-reference";

/**
 * How an attachment is written into a payload, and read back out of one.
 *
 * Two event types record attachments and both encode them the same way, so the shape lives
 * here instead of being written twice and drifting once.
 *
 * A bare string decodes as an artifact id. That is the shape the first version of the field
 * had, and reading it costs one branch, which is cheaper than an upcaster that would have
 * to be carried forever for a field that only ever held an id.
 */
export class AttachmentReferenceCodec {
	public encode(reference: AttachmentReference): Record<string, unknown> {
		const url = reference.url;
		if (url !== undefined) return { url, mediaType: reference.mediaType };
		return { id: reference.artifactId?.value };
	}

	public decode(value: unknown): AttachmentReference | undefined {
		if (typeof value === "string") return AttachmentReference.artifact(ArtifactId.from(value));
		if (typeof value !== "object" || value === null) return undefined;

		const url = Reflect.get(value, "url");
		const mediaType = Reflect.get(value, "mediaType");
		if (typeof url === "string" && typeof mediaType === "string") return AttachmentReference.link(url, mediaType);

		const id = Reflect.get(value, "id");
		return typeof id === "string" ? AttachmentReference.artifact(ArtifactId.from(id)) : undefined;
	}
}
