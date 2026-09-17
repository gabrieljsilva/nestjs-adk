import type { ArtifactId } from "../../../common/identity/artifact-id.value-object";
import type { SessionId } from "../../../common/identity/session-id.value-object";
import { ArtifactContent } from "../../../domain/artifact/artifact-content.value-object";
import { StoredRow } from "../codec/stored-row.record";
import type { SqliteConnection } from "./sqlite-connection.adapter";

export class ArtifactRepository {
	public constructor(private readonly connection: SqliteConnection) {}

	public insert(sessionId: SessionId, artifactId: ArtifactId, content: ArtifactContent): void {
		this.connection.run(
			"INSERT INTO session_artifacts (session_id, artifact_id, media_type, content) VALUES (?, ?, ?, ?) ON CONFLICT (session_id, artifact_id) DO UPDATE SET media_type = excluded.media_type, content = excluded.content",
			sessionId.value,
			artifactId.value,
			content.mediaType,
			content.text,
		);
	}

	public find(sessionId: SessionId, artifactId: ArtifactId): ArtifactContent | undefined {
		const found = this.connection.first(
			"SELECT media_type, content FROM session_artifacts WHERE session_id = ? AND artifact_id = ?",
			sessionId.value,
			artifactId.value,
		);
		if (found === undefined) return undefined;
		const row = new StoredRow(found);
		return new ArtifactContent(row.text("content"), row.text("media_type"));
	}

	public deleteAll(sessionId: SessionId): void {
		this.connection.run("DELETE FROM session_artifacts WHERE session_id = ?", sessionId.value);
	}
}
