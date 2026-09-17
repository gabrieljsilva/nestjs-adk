import type { ContentDigest } from "../../common/digest/content-digest.value-object";
import type { ArtifactId } from "../../common/identity/artifact-id.value-object";
import type { SessionId } from "../../common/identity/session-id.value-object";
import type { ArtifactContent } from "./artifact-content.value-object";
import { OffloadDecision } from "./offload-decision.value-object";

/**
 * A handle to content that lives outside the context, and the proof of what it was.
 *
 * The session scopes it, so one conversation cannot read another's; the digest fixes what it
 * pointed at, so a reference that comes back changed is refused instead of followed; and the
 * size lets a caller decide whether reading it is worth the room.
 */
export class ArtifactReference {
	private constructor(
		public readonly id: ArtifactId,
		public readonly sessionId: SessionId,
		public readonly digest: ContentDigest,
		public readonly mediaType: string,
		public readonly characters: number,
	) {}

	public static fromContent(id: ArtifactId, sessionId: SessionId, content: ArtifactContent): ArtifactReference {
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

	public toString(decision: OffloadDecision = OffloadDecision.OPAQUE): string {
		const head = `artifact ${this.id.value}, ${this.mediaType}, ${this.characters} characters`;
		if (!decision.isExplorable) return `[${head}, read with read_artifact(artifactId, offset, limit)]`;
		return `[${head}, read with read_artifact(artifactId, offset, limit), or explore with outline_artifact, search_artifact and query_artifact]`;
	}
}
