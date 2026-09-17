import type { ArtifactId } from "../../../common/identity/artifact-id.value-object";

/**
 * How the journal names something that was attached, without holding it: an artifact id for
 * bytes the runtime stored, an address for a link, an external id for a file the application
 * owns and an `AttachmentResolver` materializes on every projection.
 * A link and an external reference carry the media type; an artifact's type lives on the artifact.
 */
export class AttachmentReference {
	private constructor(
		public readonly artifactId?: ArtifactId,
		public readonly url?: string,
		public readonly mediaType?: string,
		public readonly externalId?: string,
	) {}

	public static artifact(artifactId: ArtifactId): AttachmentReference {
		return new AttachmentReference(artifactId);
	}

	public static link(url: string, mediaType: string): AttachmentReference {
		return new AttachmentReference(undefined, url, mediaType);
	}

	public static external(externalId: string, mediaType: string): AttachmentReference {
		return new AttachmentReference(undefined, undefined, mediaType, externalId);
	}

	public get isLink(): boolean {
		return this.url !== undefined;
	}

	public get isExternal(): boolean {
		return this.externalId !== undefined;
	}
}
