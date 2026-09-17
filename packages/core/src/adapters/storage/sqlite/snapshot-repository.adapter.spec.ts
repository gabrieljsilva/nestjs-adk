import { describe, expect, it } from "vitest";
import { ContentDigest } from "../../../common/digest/content-digest.value-object";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { SessionRevision } from "../../../common/revision/session-revision.value-object";
import { AgentName } from "../../../domain/agent/agent-name.value-object";
import { SessionSnapshot } from "../../../domain/session/state/session-snapshot.value-object";
import { SessionState } from "../../../domain/session/state/session-state.value-object";
import { StateValues } from "../../../domain/session/state/state-values.value-object";
import { SnapshotCodec } from "../codec/snapshot/snapshot.codec";
import { SnapshotRepository } from "./snapshot-repository.adapter";
import { SqliteConnection } from "./sqlite-connection.adapter";

const ID = SessionId.from("s-1");

function repository(): SnapshotRepository {
	return new SnapshotRepository(new SqliteConnection(), new SnapshotCodec());
}

function snapshotOf(revision: number, agent: string): SessionSnapshot {
	const state = SessionState.restored(
		SessionRevision.of(revision),
		StateValues.of([["tier", "gold"]]),
		AgentName.from(agent),
	);
	return new SessionSnapshot(ID, SessionRevision.of(revision), 4, state, ContentDigest.of("sha256", "abc"));
}

describe("SnapshotRepository", () => {
	it("reads back the state it stored", () => {
		const snapshots = repository();
		snapshots.save(snapshotOf(3, "billing"));

		const found = snapshots.find(ID);

		expect(found?.revision.value).toBe(3);
		expect(found?.projectorVersion).toBe(4);
		expect(found?.state.activeAgent?.value).toBe("billing");
		expect(found?.state.values.get("tier")).toBe("gold");
		expect(found?.checksum.value).toBe("abc");
	});

	it("keeps only the latest, because an older shortcut is only more work", () => {
		const snapshots = repository();
		snapshots.save(snapshotOf(3, "billing"));
		snapshots.save(snapshotOf(9, "support"));

		expect(snapshots.find(ID)?.revision.value).toBe(9);
		expect(snapshots.find(ID)?.state.activeAgent?.value).toBe("support");
	});

	it("finds nothing for a session that never had one", () => {
		expect(repository().find(ID)).toBeUndefined();
	});

	it("forgets a snapshot it deleted", () => {
		const snapshots = repository();
		snapshots.save(snapshotOf(3, "billing"));

		snapshots.delete(ID);

		expect(snapshots.find(ID)).toBeUndefined();
	});
});
