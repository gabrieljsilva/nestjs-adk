import type { ArtifactId } from "../../../common/identity/artifact-id.value-object";

/**
 * How the journal names something that was attached, without holding it: an artifact id for
 * bytes the runtime stored, an address for a link, an external id for a file the application
 * owns and an `AttachmentResolver` materializes on every projection.
 * Every form carries the media type when it is known, so the runtime can tell an image, which
 * needs a model that sees, from a text artifact, which the model reads through a tool.
 */
export class AttachmentReference {
	private constructor(
		public readonly artifactId?: ArtifactId,
		public readonly url?: string,
		public readonly mediaType?: string,
		public readonly externalId?: string,
	) {}

	public static artifact(artifactId: ArtifactId, mediaType?: string): AttachmentReference {
		return new AttachmentReference(artifactId, undefined, mediaType);
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

	public get isStored(): boolean {
		return this.artifactId !== undefined;
	}

	public get isImage(): boolean {
		return this.mediaType?.startsWith("image/") === true;
	}

	public get needsMediaInput(): boolean {
		return this.mediaType === undefined || this.isImage;
	}

	public get isReadableArtifact(): boolean {
		return this.isStored && this.mediaType !== undefined && !this.isImage;
	}
}
