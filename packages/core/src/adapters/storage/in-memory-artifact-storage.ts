import { ArtifactId } from "../../common/identity/artifact-id";
import type { IdGenerator } from "../../common/identity/id-generator";
import type { SessionId } from "../../common/identity/session-id";
import { ArtifactStorage } from "../../contracts/artifact-storage";
import type { ArtifactContent } from "../../domain/artifact/artifact-content";
import { ArtifactReference } from "../../domain/artifact/artifact-reference";
import { ArtifactNotFoundError } from "../../domain/artifact/errors/artifact-not-found.error";
import { TamperedArtifactReferenceError } from "../../domain/artifact/errors/tampered-artifact-reference.error";

/**
 * Reference artifact storage, and the shape every durable adapter is measured against.
 *
 * Content is kept under the session first and the artifact second, so a read scoped to
 * the wrong session misses rather than matches, and no key concatenation can make two
 * different pairs collide into one. What comes back is checked against the digest the
 * caller arrived with, which catches a rewritten reference and a store that lost content
 * under an id it kept.
 */
export class InMemoryArtifactStorage extends ArtifactStorage {
	private readonly bySession = new Map<string, Map<string, ArtifactContent>>();

	public constructor(private readonly ids: IdGenerator) {
		super();
	}

	public async put(sessionId: SessionId, content: ArtifactContent): Promise<ArtifactReference> {
		const reference = ArtifactReference.of(ArtifactId.from(this.ids.next()), sessionId, content);
		const owned = this.bySession.get(sessionId.value) ?? new Map<string, ArtifactContent>();
		owned.set(reference.id.value, content);
		this.bySession.set(sessionId.value, owned);
		return reference;
	}

	public async read(sessionId: SessionId, reference: ArtifactReference): Promise<ArtifactContent> {
		const content = reference.belongsTo(sessionId)
			? this.bySession.get(sessionId.value)?.get(reference.id.value)
			: undefined;
		if (content === undefined) throw new ArtifactNotFoundError(reference.id.value, sessionId.value);
		if (!reference.matches(content)) {
			throw new TamperedArtifactReferenceError(
				reference.id.value,
				reference.digest.toString(),
				content.digest().toString(),
			);
		}
		return content;
	}

	public async find(sessionId: SessionId, artifactId: ArtifactId): Promise<ArtifactReference | undefined> {
		const content = this.bySession.get(sessionId.value)?.get(artifactId.value);
		return content === undefined ? undefined : ArtifactReference.of(artifactId, sessionId, content);
	}

	public async deleteAll(sessionId: SessionId): Promise<void> {
		this.bySession.delete(sessionId.value);
	}
}
