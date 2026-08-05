import { ContentDigest } from "../../../common/digest/content-digest";
import type { SessionId } from "../../../common/identity/session-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { SessionSnapshot } from "../../../domain/session/session-snapshot";
import type { SessionStateCodec } from "../../../domain/session/session-state-codec";
import type { SqliteConnection } from "./sqlite-connection";
import { SqliteRow } from "./sqlite-row";

/**
 * The one shortcut a session keeps, replaced every time a newer one is written.
 *
 * Only the latest matters: an older snapshot is strictly more work to use than the one
 * after it, so keeping a history of them would be paying storage to be slower.
 */
export class SnapshotRepository {
	public constructor(
		private readonly connection: SqliteConnection,
		private readonly codec: SessionStateCodec,
	) {}

	public save(snapshot: SessionSnapshot): void {
		this.connection.run(
			"INSERT INTO session_snapshots (session_id, revision, projector_version, checksum_algorithm, checksum_value, state) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (session_id) DO UPDATE SET revision = excluded.revision, projector_version = excluded.projector_version, checksum_algorithm = excluded.checksum_algorithm, checksum_value = excluded.checksum_value, state = excluded.state",
			snapshot.sessionId.value,
			snapshot.revision.value,
			snapshot.projectorVersion,
			snapshot.checksum.algorithm,
			snapshot.checksum.value,
			JSON.stringify(this.codec.encode(snapshot.state)),
		);
	}

	public find(sessionId: SessionId): SessionSnapshot | undefined {
		const found = this.connection.first("SELECT * FROM session_snapshots WHERE session_id = ?", sessionId.value);
		if (found === undefined) return undefined;
		const row = new SqliteRow(found);
		return new SessionSnapshot(
			sessionId,
			SessionRevision.of(row.integer("revision")),
			row.integer("projector_version"),
			this.codec.decode(row.json("state")),
			ContentDigest.of(row.text("checksum_algorithm"), row.text("checksum_value")),
		);
	}

	public delete(sessionId: SessionId): void {
		this.connection.run("DELETE FROM session_snapshots WHERE session_id = ?", sessionId.value);
	}
}
