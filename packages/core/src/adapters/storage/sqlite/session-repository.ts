import { SessionId } from "../../../common/identity/session-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { Instant } from "../../../common/time/instant";
import { AgentName } from "../../../domain/agent/agent-name";
import { Session } from "../../../domain/session/session";
import { SessionMode } from "../../../domain/session/session-mode";
import { SessionOwner } from "../../../domain/session/session-owner";
import { SessionStatus } from "../../../domain/session/session-status";
import { UnreadableStoredValueError } from "./errors/unreadable-stored-value.error";
import type { SqliteConnection } from "./sqlite-connection";
import { SqliteRow } from "./sqlite-row";

/**
 * The heads of conversations, and nothing about what was said in them.
 *
 * It is a repository in the plain sense: rows in, domain objects out, and no decision of
 * its own. Whether an append is allowed, whether a revision is the expected one and what
 * to do about it belong to the storage that orchestrates these, because those are answers
 * about a session and not about a table.
 */
export class SessionRepository {
	public constructor(private readonly connection: SqliteConnection) {}

	public insert(session: Session): void {
		this.connection.run(
			"INSERT INTO sessions (id, root_agent, mode, status, revision, created_at, updated_at, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			session.id.value,
			session.rootAgent.value,
			session.mode.toString(),
			session.status.toString(),
			session.revision.value,
			session.createdAt.toIso(),
			session.updatedAt.toIso(),
			session.owner?.value ?? null,
		);
	}

	public find(sessionId: SessionId): Session | undefined {
		const row = this.connection.first("SELECT * FROM sessions WHERE id = ?", sessionId.value);
		return row === undefined ? undefined : this.toSession(new SqliteRow(row));
	}

	public advance(session: Session): void {
		this.connection.run(
			"UPDATE sessions SET revision = ?, updated_at = ?, status = ? WHERE id = ?",
			session.revision.value,
			session.updatedAt.toIso(),
			session.status.toString(),
			session.id.value,
		);
	}

	public delete(sessionId: SessionId): void {
		this.connection.run("DELETE FROM sessions WHERE id = ?", sessionId.value);
	}

	private toSession(row: SqliteRow): Session {
		const owner = row.optionalText("owner");
		return Session.restore(
			SessionId.from(row.text("id")),
			AgentName.from(row.text("root_agent")),
			this.modeOf(row.text("mode")),
			this.statusOf(row.text("status")),
			SessionRevision.of(row.integer("revision")),
			Instant.fromIso(row.text("created_at")),
			Instant.fromIso(row.text("updated_at")),
			owner === undefined ? undefined : SessionOwner.from(owner),
		);
	}

	private modeOf(value: string): SessionMode {
		const mode = SessionMode.of(value);
		if (mode === undefined) throw new UnreadableStoredValueError("mode", value);
		return mode;
	}

	private statusOf(value: string): SessionStatus {
		const status = SessionStatus.of(value);
		if (status === undefined) throw new UnreadableStoredValueError("status", value);
		return status;
	}
}
