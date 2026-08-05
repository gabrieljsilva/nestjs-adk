import type { ArtifactId } from "../../common/identity/artifact-id";
import type { SessionId } from "../../common/identity/session-id";
import { ArtifactStorage } from "../../contracts/artifact-storage";
import type { ArtifactContent } from "../../domain/artifact/artifact-content";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference";
import type { AttachmentReference } from "../../domain/model/attachment-reference";
import { MediaPart } from "../../domain/model/media-part";

/** How much of the cache is worth keeping: one request's worth of media, and no more. */
const MAX_CACHED_BYTES = 8 * 1024 * 1024;

/**
 * Brings attachments back so a message can be read as it was sent.
 *
 * The journal is projected once per turn, so without a cache the image attached on the
 * first question would be fetched again on every question after it, for the whole life of
 * the conversation. What is cached is keyed by session and id, so nothing can read across
 * sessions, and the cache is bounded by bytes rather than by entries, because the thing
 * being held is measured in megabytes.
 *
 * A link costs nothing to bring back: the address was the record, so it is rebuilt without
 * touching storage and never enters the cache.
 *
 * An attachment that no longer resolves is left out rather than raised. It was already
 * answered when it was sent, and refusing to project the session would make one missing
 * image end every turn that came after it.
 */
export class AttachmentReader {
	private readonly cached = new Map<string, MediaPart>();
	private cachedBytes = 0;

	public constructor(private readonly storage: ArtifactStorage) {}

	/**
	 * A reader with nowhere to read from, for a caller that has no artifact storage.
	 * It answers nothing rather than pretending, which is what a projection built outside a
	 * runtime needs: the words are all it was ever going to get.
	 */
	public static none(): AttachmentReader {
		return new AttachmentReader(new UnreachableArtifactStorage());
	}

	public async read(sessionId: SessionId, references: readonly AttachmentReference[]): Promise<readonly MediaPart[]> {
		const parts: MediaPart[] = [];
		for (const reference of references) {
			const part = await this.one(sessionId, reference);
			if (part !== undefined) parts.push(part);
		}
		return parts;
	}

	private async one(sessionId: SessionId, reference: AttachmentReference): Promise<MediaPart | undefined> {
		const url = reference.url;
		if (url !== undefined) return this.linked(url, reference.mediaType);

		const id = reference.artifactId;
		if (id === undefined) return undefined;
		const key = `${sessionId.value}/${id.value}`;
		const hit = this.cached.get(key);
		if (hit !== undefined) return hit;

		const part = await this.fetch(sessionId, id);
		if (part !== undefined) this.remember(key, part);
		return part;
	}

	/** A link that no longer passes validation is dropped, the same as an unreadable artifact. */
	private linked(url: string, mediaType?: string): MediaPart | undefined {
		if (mediaType === undefined) return undefined;
		try {
			return MediaPart.link(url, mediaType);
		} catch {
			return undefined;
		}
	}

	private async fetch(sessionId: SessionId, id: ArtifactId): Promise<MediaPart | undefined> {
		try {
			const reference = await this.storage.find(sessionId, id);
			if (reference === undefined) return undefined;
			const content = await this.storage.read(sessionId, reference);
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
			this.forget(oldest.value);
		}
		this.cached.set(key, part);
		this.cachedBytes += part.encodedBytes;
	}

	private forget(key: string): void {
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
