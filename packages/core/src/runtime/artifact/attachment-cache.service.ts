import type { ArtifactId } from "../../common/identity/artifact-id.value-object";
import type { SessionId } from "../../common/identity/session-id.value-object";
import type { MediaPart } from "../../domain/model/messages/media-part.value-object";

const MAX_CACHED_BYTES = 8 * 1024 * 1024;

export class AttachmentCache {
	private readonly parts = new Map<string, MediaPart>();
	private bytes = 0;

	public constructor(private readonly maxBytes: number = MAX_CACHED_BYTES) {}

	public find(sessionId: SessionId, id: ArtifactId): MediaPart | undefined {
		return this.parts.get(AttachmentCache.buildKey(sessionId, id));
	}

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
