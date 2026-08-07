import type { SessionId } from "../../../common/identity/session-id";
import type { Session } from "../../../domain/session/session";
import type { SessionHeadCodec } from "../codec/session-head-codec";
import { StoredRow } from "../codec/stored-row";
import type { SqliteConnection } from "./sqlite-connection";

/**
 * The heads of conversations, and nothing about what was said in them.
 *
 * It is a repository in the plain sense: rows in, domain objects out, and no decision of
 * its own. Whether an append is allowed, whether a revision is the expected one and what
 * to do about it belong to the storage that orchestrates these, because those are answers
 * about a session and not about a table.
 */
export class SessionRepository {
	public constructor(
		private readonly connection: SqliteConnection,
		private readonly codec: SessionHeadCodec,
	) {}

	public insert(session: Session): void {
		const record = this.codec.encode(session);
		this.connection.run(
			"INSERT INTO sessions (id, root_agent, mode, status, revision, created_at, updated_at, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			record.id,
			record.rootAgent,
			record.mode,
			record.status,
			record.revision,
			record.createdAt,
			record.updatedAt,
			record.owner ?? null,
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
			mode: row.text("mode"),
			status: row.text("status"),
			revision: row.integer("revision"),
			createdAt: row.text("created_at"),
			updatedAt: row.text("updated_at"),
			owner: row.optionalText("owner"),
		});
	}
}
