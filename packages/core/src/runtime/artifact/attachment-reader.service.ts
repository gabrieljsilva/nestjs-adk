import type { ArtifactId } from "../../common/identity/artifact-id.value-object";
import type { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { AttachmentResolver } from "../../contracts/context/attachment-resolver.contract";
import { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import { AttachmentProjection } from "../../domain/model/attachment/attachment-projection.value-object";
import type { AttachmentReference } from "../../domain/model/attachment/attachment-reference.value-object";
import { AttachmentRequest } from "../../domain/model/attachment/attachment-request.value-object";
import { MediaLimits } from "../../domain/model/descriptor/media-limits.value-object";
import { MediaPart } from "../../domain/model/messages/media-part.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { DefaultAttachmentResolver } from "./default-attachment-resolver.adapter";
import { ResolvedAttachments } from "./resolved-attachments.value-object";

/** How much of the cache is worth keeping: one request's worth of media, and no more. */
const MAX_CACHED_BYTES = 8 * 1024 * 1024;

/**
 * Brings attachments back so a message can be read as it was sent, asking the resolver
 * what each one becomes this time.
 *
 * Every reference goes through the resolver on every projection, because materialization
 * is a per-turn answer: bytes now, a fresh address now, a line of text, or nothing. What
 * the runtime can materialize on its own is offered to the resolver through the request,
 * and that is the only thing this cache ever holds. Resolver output is never cached: a
 * URL signed for this turn is wrong on the next one, and only the application knows the
 * TTL of what it minted.
 *
 * The journal is projected once per turn, so without a cache the image attached on the
 * first question would be fetched again on every question after it, for the whole life of
 * the conversation. What is cached is keyed by session and id, so nothing can read across
 * sessions, and the cache is bounded by bytes rather than by entries, because the thing
 * being held is measured in megabytes.
 *
 * A resolver that throws does not end the turn: the attachment was already answered when
 * it was sent, and refusing to project the session would make one missing image end every
 * turn that came after it. It projects as a note instead of silence, so the model is told
 * an attachment stood there.
 */
export class AttachmentReader {
	private readonly cached = new Map<string, MediaPart>();
	private cachedBytes = 0;

	public constructor(
		private readonly storage: ArtifactStorage,
		private readonly resolver: AttachmentResolver = new DefaultAttachmentResolver(),
	) {}

	/**
	 * A reader with nowhere to read from, for a caller that has no artifact storage.
	 * It answers nothing rather than pretending, which is what a projection built outside a
	 * runtime needs: the words are all it was ever going to get.
	 */
	public static none(): AttachmentReader {
		return new AttachmentReader(new UnreachableArtifactStorage());
	}

	/**
	 * Drops everything cached for one conversation, because its bytes are gone.
	 *
	 * A cache keyed by session and id outlives the session unless somebody says so: after a
	 * delete, an id reissued to the same session would read the previous session's image back
	 * out of memory. The runtime calls this from the one place a session is deleted, and it is
	 * public so an application deleting through the port itself can say the same thing.
	 */
	public forget(context: SessionContext): void {
		const prefix = `${context.sessionId.value}/`;
		for (const key of [...this.cached.keys()]) {
			if (key.startsWith(prefix)) this.forgetKey(key);
		}
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

	/** The runtime's own answer: stored bytes, a recorded address, nothing for an external id. */
	private async materialize(context: SessionContext, reference: AttachmentReference): Promise<MediaPart | undefined> {
		const url = reference.url;
		if (url !== undefined) return this.linked(url, reference.mediaType);

		const id = reference.artifactId;
		if (id === undefined) return undefined;
		const key = `${context.sessionId.value}/${id.value}`;
		const hit = this.cached.get(key);
		if (hit !== undefined) return hit;

		const part = await this.fetch(context, id);
		if (part !== undefined) this.remember(key, part);
		return part;
	}

	/**
	 * A link that no longer passes validation is dropped, the same as an unreadable artifact.
	 * A private host is not revalidated here, because this is a recorded fact being rebuilt;
	 * everything else is checked against the default limits, so a type accepted at the
	 * boundary under widened limits is dropped on replay rather than sent unvalidated.
	 */
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

	/** Oldest out first: a conversation reads its recent images far more often than its old ones. */
	private remember(key: string, part: MediaPart): void {
		if (part.encodedBytes > MAX_CACHED_BYTES) return;
		while (this.cachedBytes + part.encodedBytes > MAX_CACHED_BYTES) {
			const oldest = this.cached.keys().next();
			if (oldest.done === true) break;
			this.forgetKey(oldest.value);
		}
		this.cached.set(key, part);
		this.cachedBytes += part.encodedBytes;
	}

	private forgetKey(key: string): void {
		const part = this.cached.get(key);
		if (part === undefined) return;
		this.cached.delete(key);
		this.cachedBytes -= part.encodedBytes;
	}
}

/** Storage that holds nothing, which is the honest shape of having none. */
class UnreachableArtifactStorage extends ArtifactStorage {
	public async put(): Promise<ArtifactReference> {
		throw new Error("This projection was built without artifact storage.");
	}

	public async read(): Promise<ArtifactContent> {
		throw new Error("This projection was built without artifact storage.");
	}

	public async find(): Promise<ArtifactReference | undefined> {
		return undefined;
	}

	public async deleteAll(): Promise<void> {
		return undefined;
	}
}
