import { ContentDigest } from "../../../../common/digest/content-digest.value-object";
import { SessionId } from "../../../../common/identity/session-id.value-object";
import { SessionRevision } from "../../../../common/revision/session-revision.value-object";
import { SessionSnapshot } from "../../../../domain/session/state/session-snapshot.value-object";
import { SessionStateCodec } from "../../../../domain/session/state/session-state.codec";
import { SnapshotRecord } from "./snapshot.record";

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
			new SessionRevision(record.revision),
			record.projectorVersion,
			this.state.decode(record.state),
			new ContentDigest(record.checksumAlgorithm, record.checksumValue),
		);
	}
}
