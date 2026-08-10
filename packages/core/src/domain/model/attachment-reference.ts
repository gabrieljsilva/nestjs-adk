import type { ArtifactId } from "../../common/identity/artifact-id";

/**
 * How the journal names something that was attached, without holding it.
 *
 * Three kinds, because an attachment arrives three ways. Bytes are written to artifact
 * storage and the id is what the event keeps. A link was never held by anything here, so
 * there is nothing to write and the address itself is the record. An external id names a
 * file the application owns: the runtime never stores bytes for it and never freezes an
 * address, and what it becomes on each projection is the application's answer, through
 * `AttachmentResolver`.
 *
 * A link and an external reference keep their media type and an artifact does not: the
 * type of stored content is already on the artifact, and repeating it would be a second
 * copy of a fact that can disagree with the first. An external attachment has no artifact
 * to carry the type, so the reference is the only place it can live.
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

	/** A file the application owns, named by the id the application already uses for it. */
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
