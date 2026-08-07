import { ContentDigest } from "../../../common/digest/content-digest";
import { SessionId } from "../../../common/identity/session-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { SessionSnapshot } from "../../../domain/session/session-snapshot";
import { SessionStateCodec } from "../../../domain/session/session-state-codec";
import { SnapshotRecord } from "./snapshot-record";

/**
 * Turns the one shortcut a session keeps into a row and back.
 *
 * A snapshot is disposable by design, so this only has to promise that what comes back
 * means what went in. It is guarded by the checksum stored next to it: a decode that
 * drifted costs a replay of the journal, never a wrong session, which is why an adapter
 * that cannot keep snapshots can honestly say so and lose nothing but time.
 */
export class SnapshotCodec {
	public constructor(private readonly state: SessionStateCodec = new SessionStateCodec()) {}

	public encode(snapshot: SessionSnapshot): SnapshotRecord {
		return new SnapshotRecord(
			snapshot.sessionId.value,
			snapshot.revision.value,
			snapshot.projectorVersion,
			snapshot.checksum.algorithm,
			snapshot.checksum.value,
			this.state.encode(snapshot.state),
		);
	}

	/** Takes the record this codec wrote, or the row a driver handed the adapter back. */
	public decode(values: unknown): SessionSnapshot {
		const record = SnapshotRecord.from(values);
		return new SessionSnapshot(
			SessionId.from(record.sessionId),
			SessionRevision.of(record.revision),
			record.projectorVersion,
			this.state.decode(record.state),
			ContentDigest.of(record.checksumAlgorithm, record.checksumValue),
		);
	}
}
