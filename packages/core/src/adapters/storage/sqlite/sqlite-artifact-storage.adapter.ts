import { ArtifactId } from "../../../common/identity/artifact-id.value-object";
import type { IdGenerator } from "../../../common/identity/id-generator.contract";
import { RandomIdGenerator } from "../../../common/identity/random-id-generator.adapter";
import { ArtifactStorage } from "../../../contracts/storage/artifact-storage.contract";
import type { ArtifactContent } from "../../../domain/artifact/artifact-content.value-object";
import { ArtifactReference } from "../../../domain/artifact/artifact-reference.value-object";
import { ArtifactNotFoundError } from "../../../domain/artifact/errors/artifact-not-found.error";
import { TamperedArtifactReferenceError } from "../../../domain/artifact/errors/tampered-artifact-reference.error";
import type { SessionContext } from "../../../domain/run/session-context.value-object";
import { ArtifactRepository } from "./artifact-repository.adapter";
import { SqliteConnection } from "./sqlite-connection.adapter";

/**
 * A durable artifact store on the SQLite that ships with Node, and the other half of
 * `SqliteSessionStorage`. Give both the same `SqliteConnection`: a durable journal whose
 * artifacts are gone comes back naming content nothing can resolve.
 *
 * The digest is verified on every read against the reference the caller arrived with.
 */
export class SqliteArtifactStorage extends ArtifactStorage {
	private readonly artifacts: ArtifactRepository;

	public constructor(
		private readonly connection: SqliteConnection = new SqliteConnection(),
		private readonly ids: IdGenerator = new RandomIdGenerator(),
	) {
		super();
		this.artifacts = new ArtifactRepository(connection);
	}

	public static at(location: string, ids: IdGenerator = new RandomIdGenerator()): SqliteArtifactStorage {
		return new SqliteArtifactStorage(new SqliteConnection(location), ids);
	}

	public async put(context: SessionContext, content: ArtifactContent): Promise<ArtifactReference> {
		const sessionId = context.sessionId;
		const id = ArtifactId.from(this.ids.next());
		this.artifacts.insert(sessionId, id, content);
		return ArtifactReference.fromContent(id, sessionId, content);
	}

	public async read(context: SessionContext, reference: ArtifactReference): Promise<ArtifactContent> {
		const sessionId = context.sessionId;
		const content = reference.belongsTo(sessionId) ? this.artifacts.find(sessionId, reference.id) : undefined;
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

	public async find(context: SessionContext, artifactId: ArtifactId): Promise<ArtifactReference | undefined> {
		const sessionId = context.sessionId;
		const content = this.artifacts.find(sessionId, artifactId);
		return content === undefined ? undefined : ArtifactReference.fromContent(artifactId, sessionId, content);
	}

	public async deleteAll(context: SessionContext): Promise<void> {
		this.artifacts.deleteAll(context.sessionId);
	}

	public close(): void {
		this.connection.close();
	}
}
