import { ArtifactId } from "../../../common/identity/artifact-id.value-object";
import { AttachmentReference } from "../../model/attachment/attachment-reference.value-object";

export class AttachmentReferenceCodec {
	public encode(reference: AttachmentReference): Record<string, unknown> {
		const url = reference.url;
		if (url !== undefined) return { url, mediaType: reference.mediaType };
		const externalId = reference.externalId;
		if (externalId !== undefined) return { externalId, mediaType: reference.mediaType };
		return { id: reference.artifactId?.value };
	}

	public decode(value: unknown): AttachmentReference | undefined {
		if (typeof value === "string") return AttachmentReference.artifact(ArtifactId.from(value));
		if (typeof value !== "object" || value === null) return undefined;

		const url = Reflect.get(value, "url");
		const mediaType = Reflect.get(value, "mediaType");
		if (typeof url === "string" && typeof mediaType === "string") return AttachmentReference.link(url, mediaType);

		const externalId = Reflect.get(value, "externalId");
		if (typeof externalId === "string" && typeof mediaType === "string") {
			return AttachmentReference.external(externalId, mediaType);
		}

		const id = Reflect.get(value, "id");
		return typeof id === "string" ? AttachmentReference.artifact(ArtifactId.from(id)) : undefined;
	}
}
