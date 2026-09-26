import type { ContentDigest } from "../../common/digest/content-digest.value-object";
import type { ArtifactId } from "../../common/identity/artifact-id.value-object";
import type { SessionId } from "../../common/identity/session-id.value-object";
import type { ArtifactContent } from "./artifact-content.value-object";
import type { ArtifactName } from "./artifact-name.value-object";
import { OffloadDecision } from "./offload-decision.value-object";

/** What a reference is rebuilt from when it comes back out of a store. */
export interface ArtifactReferenceParams {
	id: ArtifactId;
	sessionId: SessionId;
	digest: ContentDigest;
	mediaType: string;
	characters: number;
	bytes?: number;
	isText?: boolean;
	name?: ArtifactName;
}

/**
 * A handle to content that lives outside the context, and the proof of what it was.
 *
 * The session scopes it, so one conversation cannot read another's; the digest fixes what it
 * pointed at, so a reference that comes back changed is refused instead of followed; the size
 * lets a caller decide whether reading it is worth the room; and the name, when there is one,
 * is what the model and the person know it by.
 */
export class ArtifactReference {
	private constructor(
		public readonly id: ArtifactId,
		public readonly sessionId: SessionId,
		public readonly digest: ContentDigest,
		public readonly mediaType: string,
		public readonly characters: number,
		public readonly bytes: number,
		public readonly isText: boolean,
		public readonly name?: ArtifactName,
	) {}

	public static fromContent(id: ArtifactId, sessionId: SessionId, content: ArtifactContent): ArtifactReference {
		return new ArtifactReference(
			id,
			sessionId,
			content.digest(),
			content.mediaType,
			content.characters,
			content.bytes,
			content.isText,
			content.name,
		);
	}

	public static restore(params: ArtifactReferenceParams): ArtifactReference {
		const characters = Math.max(0, Math.trunc(params.characters));
		return new ArtifactReference(
			params.id,
			params.sessionId,
			params.digest,
			params.mediaType,
			characters,
			Math.max(0, Math.trunc(params.bytes ?? characters)),
			params.isText ?? true,
			params.name,
		);
	}

	public belongsTo(sessionId: SessionId): boolean {
		return this.sessionId.equals(sessionId);
	}

	public matches(content: ArtifactContent): boolean {
		return this.digest.equals(content.digest());
	}

	public toString(decision: OffloadDecision = OffloadDecision.OPAQUE): string {
		const title =
			this.name === undefined ? `artifact ${this.id.value}` : `artifact ${this.id.value} "${this.name.value}"`;
		const size = this.isText ? `${this.characters} characters` : `${this.bytes} bytes`;
		const head = `${title}, ${this.mediaType}, ${size}`;
		if (!this.isText) return `[${head}, not readable by a tool]`;
		const readClause = "read with read_artifact(artifactId, offset, limit)";
		if (!decision.isExplorable) return `[${head}, ${readClause}]`;
		return `[${head}, ${readClause}, and its shape is one the artifact exploration tools understand]`;
	}
}
