import type { ArtifactId } from "../../common/identity/artifact-id.value-object";
import type { SessionId } from "../../common/identity/session-id.value-object";
import type { MediaPart } from "../../domain/model/messages/media-part.value-object";

/** How much of the cache is worth keeping: one request's worth of media, and no more. */
const MAX_CACHED_BYTES = 8 * 1024 * 1024;

/**
 * The bytes of an attachment, kept between projections of the same conversation.
 *
 * The journal is projected once per turn, so without this the image attached on the first
 * question would be fetched again on every question after it, for the whole life of the
 * conversation.
 *
 * It is bounded by bytes rather than by entries, because what it holds is measured in
 * megabytes and an entry count says nothing about how much memory ten of them are. Oldest
 * out first: a conversation reads its recent images far more often than its old ones.
 *
 * Every key names a session as well as an artifact, so nothing can read across
 * conversations even if an id is reissued.
 */
export class AttachmentCache {
	private readonly parts = new Map<string, MediaPart>();
	private bytes = 0;

	public constructor(private readonly maxBytes: number = MAX_CACHED_BYTES) {}

	public find(sessionId: SessionId, id: ArtifactId): MediaPart | undefined {
		return this.parts.get(AttachmentCache.buildKey(sessionId, id));
	}

	/** Keeps the part, evicting the oldest until it fits. One too large to fit is not kept. */
	public remember(sessionId: SessionId, id: ArtifactId, part: MediaPart): void {
		if (part.encodedBytes > this.maxBytes) return;
		while (this.bytes + part.encodedBytes > this.maxBytes) {
			const oldest = this.parts.keys().next();
			if (oldest.done === true) break;
			this.forgetKey(oldest.value);
		}
		this.parts.set(AttachmentCache.buildKey(sessionId, id), part);
		this.bytes += part.encodedBytes;
	}

	/**
	 * Drops everything cached for one conversation, because its bytes are gone.
	 *
	 * A cache keyed by session and id outlives the session unless somebody says so: after a
	 * delete, an id reissued to the same session would read the previous session's image back
	 * out of memory.
	 */
	public forget(sessionId: SessionId): void {
		const prefix = `${sessionId.value}/`;
		for (const key of [...this.parts.keys()]) {
			if (key.startsWith(prefix)) this.forgetKey(key);
		}
	}

	private forgetKey(key: string): void {
		const part = this.parts.get(key);
		if (part === undefined) return;
		this.parts.delete(key);
		this.bytes -= part.encodedBytes;
	}

	private static buildKey(sessionId: SessionId, id: ArtifactId): string {
		return `${sessionId.value}/${id.value}`;
	}
}
