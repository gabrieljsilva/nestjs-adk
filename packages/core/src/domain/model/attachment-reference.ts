import type { ArtifactId } from "../../common/identity/artifact-id";

/**
 * How the journal names something that was attached, without holding it.
 *
 * Two kinds, because an attachment arrives two ways. Bytes are written to artifact storage
 * and the id is what the event keeps. A link was never held by anything here, so there is
 * nothing to write and the address itself is the record.
 *
 * A link keeps its media type and an artifact does not: the type of stored content is
 * already on the artifact, and repeating it would be a second copy of a fact that can
 * disagree with the first.
 */
export class AttachmentReference {
	private constructor(
		public readonly artifactId?: ArtifactId,
		public readonly url?: string,
		public readonly mediaType?: string,
	) {}

	public static artifact(artifactId: ArtifactId): AttachmentReference {
		return new AttachmentReference(artifactId);
	}

	public static link(url: string, mediaType: string): AttachmentReference {
		return new AttachmentReference(undefined, url, mediaType);
	}

	public get isLink(): boolean {
		return this.url !== undefined;
	}
}
