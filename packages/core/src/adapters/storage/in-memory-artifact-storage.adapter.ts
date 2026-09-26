import { ArtifactId } from "../../common/identity/artifact-id.value-object";
import type { IdGenerator } from "../../common/identity/id-generator.contract";
import { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import { ArtifactNotFoundError } from "../../domain/artifact/errors/artifact-not-found.error";
import { TamperedArtifactReferenceError } from "../../domain/artifact/errors/tampered-artifact-reference.error";
import type { SessionContext } from "../../domain/run/session-context.value-object";

/**
 * Artifact content kept in this process, the artifact half of the default storage. Nothing
 * survives a restart.
 *
 * Content is scoped to the session it was written under, and every read is checked against the
 * digest the caller arrived with.
 */
export class InMemoryArtifactStorage extends ArtifactStorage {
	private readonly bySession = new Map<string, Map<string, ArtifactContent>>();

	public constructor(private readonly ids: IdGenerator) {
		super();
	}

	public async put(context: SessionContext, content: ArtifactContent): Promise<ArtifactReference> {
		const sessionId = context.sessionId;
		const reference = ArtifactReference.fromContent(ArtifactId.from(this.ids.next()), sessionId, content);
		const owned = this.bySession.get(sessionId.value) ?? new Map<string, ArtifactContent>();
		owned.set(reference.id.value, content);
		this.bySession.set(sessionId.value, owned);
		return reference;
	}

	public async read(context: SessionContext, reference: ArtifactReference): Promise<ArtifactContent> {
		const sessionId = context.sessionId;
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

	public async update(
		context: SessionContext,
		reference: ArtifactReference,
		content: ArtifactContent,
	): Promise<ArtifactReference> {
		const sessionId = context.sessionId;
		const owned = reference.belongsTo(sessionId) ? this.bySession.get(sessionId.value) : undefined;
		const held = owned?.get(reference.id.value);
		if (owned === undefined || held === undefined) {
			throw new ArtifactNotFoundError(reference.id.value, sessionId.value);
		}
		if (!reference.matches(held)) {
			throw new TamperedArtifactReferenceError(reference.id.value, reference.digest.toString(), held.digest().toString());
		}
		owned.set(reference.id.value, content);
		return ArtifactReference.fromContent(reference.id, sessionId, content);
	}

	public async find(context: SessionContext, artifactId: ArtifactId): Promise<ArtifactReference | undefined> {
		const sessionId = context.sessionId;
		const content = this.bySession.get(sessionId.value)?.get(artifactId.value);
		return content === undefined ? undefined : ArtifactReference.fromContent(artifactId, sessionId, content);
	}

	public async list(context: SessionContext, limit: number): Promise<readonly ArtifactReference[]> {
		const sessionId = context.sessionId;
		const owned = [...(this.bySession.get(sessionId.value) ?? new Map<string, ArtifactContent>())];
		return owned
			.reverse()
			.slice(0, Math.max(0, Math.trunc(limit)))
			.map(([id, content]) => ArtifactReference.fromContent(ArtifactId.from(id), sessionId, content));
	}

	public async deleteAll(context: SessionContext): Promise<void> {
		this.bySession.delete(context.sessionId.value);
	}
}
