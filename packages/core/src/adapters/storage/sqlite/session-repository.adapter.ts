import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { Session } from "../../../domain/session/session.entity";
import type { SessionHeadCodec } from "../codec/session-head/session-head.codec";
import { StoredRow } from "../codec/stored-row.record";
import type { SqliteConnection } from "./sqlite-connection.adapter";

export class SessionRepository {
	public constructor(
		private readonly connection: SqliteConnection,
		private readonly codec: SessionHeadCodec,
	) {}

	public insert(session: Session): void {
		const record = this.codec.encode(session);
		this.connection.run(
			"INSERT INTO sessions (id, root_agent, status, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			record.id,
			record.rootAgent,
			record.status,
			record.revision,
			record.createdAt,
			record.updatedAt,
		);
	}

	public find(sessionId: SessionId): Session | undefined {
		const row = this.connection.first("SELECT * FROM sessions WHERE id = ?", sessionId.value);
		return row === undefined ? undefined : this.toSession(new StoredRow(row));
	}

	public advance(session: Session): void {
		const record = this.codec.encode(session);
		this.connection.run(
			"UPDATE sessions SET revision = ?, updated_at = ?, status = ? WHERE id = ?",
			record.revision,
			record.updatedAt,
			record.status,
			record.id,
		);
	}

	public delete(sessionId: SessionId): void {
		this.connection.run("DELETE FROM sessions WHERE id = ?", sessionId.value);
	}

	private toSession(row: StoredRow): Session {
		return this.codec.decode({
			id: row.text("id"),
			rootAgent: row.text("root_agent"),
			status: row.text("status"),
			revision: row.integer("revision"),
			createdAt: row.text("created_at"),
			updatedAt: row.text("updated_at"),
		});
	}
}
