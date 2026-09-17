import type { ArtifactId } from "../../common/identity/artifact-id.value-object";
import type { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { AttachmentResolver } from "../../contracts/context/attachment-resolver.contract";
import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import { AttachmentProjection } from "../../domain/model/attachment/attachment-projection.value-object";
import type { AttachmentReference } from "../../domain/model/attachment/attachment-reference.value-object";
import { AttachmentRequest } from "../../domain/model/attachment/attachment-request.value-object";
import { MediaLimits } from "../../domain/model/descriptor/media-limits.value-object";
import { MediaPart } from "../../domain/model/messages/media-part.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { AbsentArtifactStorage } from "./absent-artifact-storage.adapter";
import { AttachmentCache } from "./attachment-cache.service";
import { DefaultAttachmentResolver } from "./default-attachment-resolver.adapter";
import { ResolvedAttachments } from "./resolved-attachments.value-object";

const ABSENT = "This projection was built without artifact storage.";

export class AttachmentReader {
	public constructor(
		private readonly storage: ArtifactStorage,
		private readonly resolver: AttachmentResolver = new DefaultAttachmentResolver(),
		private readonly cache: AttachmentCache = new AttachmentCache(),
	) {}

	public static none(): AttachmentReader {
		return new AttachmentReader(new AbsentArtifactStorage(ABSENT));
	}

	public forget(context: SessionContext): void {
		this.cache.forget(context.sessionId);
	}

	public async read(
		context: SessionContext,
		references: readonly AttachmentReference[],
		revision: SessionRevision,
		isCurrentRun: boolean,
		acceptsRemoteUrl: boolean,
	): Promise<ResolvedAttachments> {
		const media: MediaPart[] = [];
		const notes: string[] = [];
		for (const reference of references) {
			const request = new AttachmentRequest(context.sessionId, reference, revision, isCurrentRun, acceptsRemoteUrl, () =>
				this.materialize(context, reference),
			);
			const projection = await this.resolveProjection(context, request);
			const part = projection.part;
			if (part !== undefined) media.push(part);
			const text = projection.text;
			if (text !== undefined) notes.push(text);
		}
		return new ResolvedAttachments(media, notes);
	}

	private async resolveProjection(context: SessionContext, request: AttachmentRequest): Promise<AttachmentProjection> {
		try {
			return await this.resolver.resolve(context, request);
		} catch {
			return AttachmentProjection.fromReference(request.reference, "could not be resolved");
		}
	}

	private async materialize(context: SessionContext, reference: AttachmentReference): Promise<MediaPart | undefined> {
		const url = reference.url;
		if (url !== undefined) return this.linked(url, reference.mediaType);

		const id = reference.artifactId;
		if (id === undefined) return undefined;
		const hit = this.cache.find(context.sessionId, id);
		if (hit !== undefined) return hit;

		const part = await this.fetch(context, id);
		if (part !== undefined) this.cache.remember(context.sessionId, id, part);
		return part;
	}

	private linked(url: string, mediaType?: string): MediaPart | undefined {
		if (mediaType === undefined) return undefined;
		try {
			return MediaPart.link(url, mediaType, MediaLimits.byDefault().allowingPrivateHosts());
		} catch {
			return undefined;
		}
	}

	private async fetch(context: SessionContext, id: ArtifactId): Promise<MediaPart | undefined> {
		try {
			const reference = await this.storage.find(context, id);
			if (reference === undefined) return undefined;
			const content = await this.storage.read(context, reference);
			return MediaPart.image(content.mediaType, content.text);
		} catch {
			return undefined;
		}
	}
}
