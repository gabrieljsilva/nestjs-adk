import type { SessionId } from "../../../common/identity/session-id";
import type { SessionSnapshot } from "../../../domain/session/session-snapshot";
import type { SnapshotCodec } from "../codec/snapshot-codec";
import { StoredRow } from "../codec/stored-row";
import type { SqliteConnection } from "./sqlite-connection";

/**
 * The one shortcut a session keeps, replaced every time a newer one is written.
 *
 * Only the latest matters: an older snapshot is strictly more work to use than the one
 * after it, so keeping a history of them would be paying storage to be slower.
 */
export class SnapshotRepository {
	public constructor(
		private readonly connection: SqliteConnection,
		private readonly codec: SnapshotCodec,
	) {}

	public save(snapshot: SessionSnapshot): void {
		const record = this.codec.encode(snapshot);
		this.connection.run(
			"INSERT INTO session_snapshots (session_id, revision, projector_version, checksum_algorithm, checksum_value, state) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (session_id) DO UPDATE SET revision = excluded.revision, projector_version = excluded.projector_version, checksum_algorithm = excluded.checksum_algorithm, checksum_value = excluded.checksum_value, state = excluded.state",
			record.sessionId,
			record.revision,
			record.projectorVersion,
			record.checksumAlgorithm,
			record.checksumValue,
			JSON.stringify(record.state),
		);
	}

	public find(sessionId: SessionId): SessionSnapshot | undefined {
		const found = this.connection.first("SELECT * FROM session_snapshots WHERE session_id = ?", sessionId.value);
		if (found === undefined) return undefined;
		const row = new StoredRow(found);
		return this.codec.decode({
			sessionId: sessionId.value,
			revision: row.integer("revision"),
			projectorVersion: row.integer("projector_version"),
			checksumAlgorithm: row.text("checksum_algorithm"),
			checksumValue: row.text("checksum_value"),
			state: row.json("state"),
		});
	}

	public delete(sessionId: SessionId): void {
		this.connection.run("DELETE FROM session_snapshots WHERE session_id = ?", sessionId.value);
	}
}
