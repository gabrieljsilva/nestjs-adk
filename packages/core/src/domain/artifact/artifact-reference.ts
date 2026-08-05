import type { ContentDigest } from "../../common/digest/content-digest";
import type { ArtifactId } from "../../common/identity/artifact-id";
import type { SessionId } from "../../common/identity/session-id";
import type { ArtifactContent } from "./artifact-content";

/**
 * A handle to content that lives outside the context, and the proof of what it was.
 *
 * It travels where the content would have: into a tool result, into the journal, into
 * a model prompt. Three things make it usable on the way back. The session scopes it,
 * so one conversation cannot read another's; the digest fixes what it pointed at, so a
 * reference that comes back changed is refused instead of followed; and the size lets a
 * caller decide whether reading it is worth the room before it does.
 */
export class ArtifactReference {
	private constructor(
		public readonly id: ArtifactId,
		public readonly sessionId: SessionId,
		public readonly digest: ContentDigest,
		public readonly mediaType: string,
		public readonly characters: number,
	) {}

	public static of(id: ArtifactId, sessionId: SessionId, content: ArtifactContent): ArtifactReference {
		return new ArtifactReference(id, sessionId, content.digest(), content.mediaType, content.characters);
	}

	public static restore(
		id: ArtifactId,
		sessionId: SessionId,
		digest: ContentDigest,
		mediaType: string,
		characters: number,
	): ArtifactReference {
		return new ArtifactReference(id, sessionId, digest, mediaType, Math.max(0, Math.trunc(characters)));
	}

	public belongsTo(sessionId: SessionId): boolean {
		return this.sessionId.equals(sessionId);
	}

	public matches(content: ArtifactContent): boolean {
		return this.digest.equals(content.digest());
	}

	/** What the model reads in place of the content, and what it needs to ask for the rest. */
	public toString(): string {
		return `[artifact ${this.id.value}, ${this.mediaType}, ${this.characters} characters]`;
	}
}
