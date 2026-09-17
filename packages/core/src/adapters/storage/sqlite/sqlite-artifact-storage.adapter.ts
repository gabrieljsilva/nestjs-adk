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
 * `SqliteSessionStorage`.
 *
 * The two go together for a reason that is not tidiness. The journal is durable, so a
 * placeholder written into a conversation outlives the process that wrote it; if the
 * artifact behind it does not, the conversation comes back naming content nothing can
 * resolve. Pointing both at one file is what makes a restart bring back the whole of what
 * was said, and it is why `SqliteConnection` is a constructor parameter here: the same
 * connection carries the sessions and their artifacts.
 *
 * It orchestrates one repository and owns the decisions the repository deliberately does
 * not: which session an artifact belongs to, and whether what came back is what was stored.
 * The digest is verified on every read against the reference the caller arrived with, which
 * catches both a reference rewritten on its way through a model and a row edited underneath
 * the store.
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

	/** Opens a database file, which is the same file the sessions belong in. */
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
