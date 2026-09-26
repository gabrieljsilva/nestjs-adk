import { ArtifactId } from "../../../common/identity/artifact-id.value-object";
import type { SessionId } from "../../../common/identity/session-id.value-object";
import { ArtifactContent } from "../../../domain/artifact/artifact-content.value-object";
import { ArtifactEncoding } from "../../../domain/artifact/artifact-encoding.value-object";
import { ArtifactName } from "../../../domain/artifact/artifact-name.value-object";
import { StoredRow } from "../codec/stored-row.record";
import type { SqliteConnection } from "./sqlite-connection.adapter";

export class ArtifactRepository {
	public constructor(private readonly connection: SqliteConnection) {}

	public insert(sessionId: SessionId, artifactId: ArtifactId, content: ArtifactContent): void {
		this.connection.run(
			"INSERT INTO session_artifacts (session_id, artifact_id, media_type, encoding, name, content, sequence) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (session_id, artifact_id) DO UPDATE SET media_type = excluded.media_type, encoding = excluded.encoding, name = excluded.name, content = excluded.content, sequence = excluded.sequence",
			sessionId.value,
			artifactId.value,
			content.mediaType,
			content.encoding.name,
			content.name?.value ?? null,
			content.text,
			this.nextSequence(),
		);
	}

	public replace(sessionId: SessionId, artifactId: ArtifactId, content: ArtifactContent): void {
		this.connection.run(
			"UPDATE session_artifacts SET media_type = ?, encoding = ?, name = ?, content = ? WHERE session_id = ? AND artifact_id = ?",
			content.mediaType,
			content.encoding.name,
			content.name?.value ?? null,
			content.text,
			sessionId.value,
			artifactId.value,
		);
	}

	public find(sessionId: SessionId, artifactId: ArtifactId): ArtifactContent | undefined {
		const found = this.connection.first(
			"SELECT media_type, encoding, name, content FROM session_artifacts WHERE session_id = ? AND artifact_id = ?",
			sessionId.value,
			artifactId.value,
		);
		if (found === undefined) return undefined;
		return this.decode(new StoredRow(found));
	}

	public list(sessionId: SessionId, limit: number): readonly [ArtifactId, ArtifactContent][] {
		const rows = this.connection.all(
			"SELECT artifact_id, media_type, encoding, name, content FROM session_artifacts WHERE session_id = ? ORDER BY sequence DESC LIMIT ?",
			sessionId.value,
			Math.max(0, Math.trunc(limit)),
		);
		return rows.map((found) => {
			const row = new StoredRow(found);
			return [ArtifactId.from(row.text("artifact_id")), this.decode(row)];
		});
	}

	public findRange(sessionId: SessionId, artifactId: ArtifactId, offset: number, length: number): string | undefined {
		const found = this.connection.first(
			"SELECT substr(content, ?, ?) AS slice FROM session_artifacts WHERE session_id = ? AND artifact_id = ?",
			offset + 1,
			length,
			sessionId.value,
			artifactId.value,
		);
		return found === undefined ? undefined : new StoredRow(found).text("slice");
	}

	public deleteAll(sessionId: SessionId): void {
		this.connection.run("DELETE FROM session_artifacts WHERE session_id = ?", sessionId.value);
	}

	private decode(row: StoredRow): ArtifactContent {
		const encoding = ArtifactEncoding.fromName(row.text("encoding")) ?? ArtifactEncoding.TEXT;
		const name = row.optionalText("name");
		return ArtifactContent.restore(
			row.text("content"),
			row.text("media_type"),
			encoding,
			name === undefined ? undefined : ArtifactName.fromText(name),
		);
	}

	private nextSequence(): number {
		const row = new StoredRow(
			this.connection.first("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM session_artifacts"),
		);
		return row.integer("next");
	}
}
