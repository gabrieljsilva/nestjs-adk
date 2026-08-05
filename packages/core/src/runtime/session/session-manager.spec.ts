import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { AgentId } from "../../common/identity/agent-id";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { CorrelationId } from "../../common/identity/correlation-id";
import { EventId } from "../../common/identity/event-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { Instant } from "../../common/time/instant";
import { SessionEventPublisher } from "../../contracts/session-event-publisher";
import type { SessionStorage } from "../../contracts/session-storage";
import { AgentName } from "../../domain/agent/agent-name";
import { AgentRunSuspended } from "../../domain/event/catalog/agent-run-suspended";
import { AgentTransferred } from "../../domain/event/catalog/agent-transferred";
import { SessionCreated } from "../../domain/event/catalog/session-created";
import { EventCorrelation } from "../../domain/event/event-correlation";
import { EventHeader } from "../../domain/event/event-header";
import { SessionEventBatch } from "../../domain/event/session-event-batch";
import type { StoredSessionEvent } from "../../domain/event/stored-session-event";
import { PendingCall } from "../../domain/session/pending-call";
import { Session } from "../../domain/session/session";
import { SessionMode } from "../../domain/session/session-mode";
import { SessionSnapshot } from "../../domain/session/session-snapshot";
import { SessionState } from "../../domain/session/session-state";
import { NoOpSessionEventPublisher } from "./no-op-session-event-publisher";
import { SessionManager } from "./session-manager";
import { SnapshotPolicy } from "./snapshot/snapshot-policy";
import { StateChecksum } from "./snapshot/state-checksum";
import { StateProjector } from "./state-projector";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SUPPORT = AgentName.from("support");
const BILLING = AgentName.from("billing");
const ID = SessionId.from("s-1");

class RecordingPublisher extends SessionEventPublisher {
	public readonly seen: StoredSessionEvent[] = [];

	public async publish(committed: readonly StoredSessionEvent[]): Promise<void> {
		this.seen.push(...committed);
	}

	public async emit(): Promise<void> {
		return undefined;
	}
}

/** A storage that takes the journal and refuses the shortcut, which must cost nothing. */
class SnapshotRefusingStorage extends InMemorySessionStorage {
	public async saveSnapshot(): Promise<void> {
		throw new Error("the snapshot table is gone");
	}
}

class FailingPublisher extends SessionEventPublisher {
	public async publish(): Promise<void> {
		throw new Error("observability is down");
	}

	public async emit(): Promise<void> {
		throw new Error("observability is down");
	}
}

function header(id: string): EventHeader {
	return new EventHeader(
		EventId.from(id),
		NOW,
		new EventCorrelation(AgentRunId.from("r-1"), AgentId.from("a-1"), CorrelationId.from("c-1")),
	);
}

function created(id: string): SessionCreated {
	return new SessionCreated(header(id), SUPPORT, undefined);
}

function suspended(id: string): AgentRunSuspended {
	const call = new PendingCall(ToolCallId.from("c-1"), "refund_order", { orderId: "42" }, "write");
	return new AgentRunSuspended(header(id), "approval required", [call]);
}

async function storageWithSession(): Promise<InMemorySessionStorage> {
	const storage = new InMemorySessionStorage();
	await storage.create(Session.start(ID, SUPPORT, SessionMode.EPHEMERAL, NOW));
	return storage;
}

function managerEvery(storage: SessionStorage, events: number): SessionManager {
	return new SessionManager(
		storage,
		new StateProjector(),
		new NoOpSessionEventPublisher(),
		new StateChecksum(),
		SnapshotPolicy.every(events),
	);
}

describe("SessionManager commit", () => {
	it("projects only what the storage confirmed", async () => {
		const storage = await storageWithSession();
		const manager = new SessionManager(storage);

		const state = await manager.commit(
			ID,
			SessionRevision.initial(),
			SessionEventBatch.of([created("e-1")]),
			SessionState.initial(),
		);

		expect(state.revision.value).toBe(1);
		expect(state.activeAgent?.value).toBe("support");
	});

	it("tells observers about the committed events", async () => {
		const storage = await storageWithSession();
		const publisher = new RecordingPublisher();
		const manager = new SessionManager(storage, new StateProjector(), publisher);

		await manager.commit(ID, SessionRevision.initial(), SessionEventBatch.of([created("e-1")]), SessionState.initial());

		expect(publisher.seen.map((stored) => stored.revision.value)).toEqual([1]);
	});

	it("keeps the journal when publication fails", async () => {
		const storage = await storageWithSession();
		const manager = new SessionManager(storage, new StateProjector(), new FailingPublisher());

		await expect(
			manager.commit(ID, SessionRevision.initial(), SessionEventBatch.of([created("e-1")]), SessionState.initial()),
		).rejects.toThrow("observability is down");

		expect((await storage.findOrFail(ID)).revision.value).toBe(1);
	});

	it("does not bother the publisher with an empty batch", async () => {
		const storage = await storageWithSession();
		const manager = new SessionManager(storage, new StateProjector(), new FailingPublisher());

		await expect(
			manager.commit(ID, SessionRevision.initial(), SessionEventBatch.empty(), SessionState.initial()),
		).resolves.toBeDefined();
	});
});

describe("SessionManager snapshot", () => {
	it("writes one when the commit crosses the threshold", async () => {
		const storage = await storageWithSession();
		const manager = managerEvery(storage, 2);

		await manager.commit(ID, SessionRevision.initial(), SessionEventBatch.of([created("e-1")]), SessionState.initial());
		expect(await storage.findSnapshot(ID)).toBeUndefined();

		await manager.commit(
			ID,
			SessionRevision.of(1),
			SessionEventBatch.of([new AgentTransferred(header("e-2"), SUPPORT, BILLING)]),
			SessionState.initial().at(SessionRevision.of(1)),
		);

		const snapshot = await storage.findSnapshot(ID);
		expect(snapshot?.revision.value).toBe(2);
		expect(snapshot?.projectorVersion).toBe(StateProjector.VERSION);
	});

	it("writes one as soon as a turn is waiting for approval, however short the session", async () => {
		const storage = await storageWithSession();
		const manager = managerEvery(storage, 50);

		await manager.commit(ID, SessionRevision.initial(), SessionEventBatch.of([suspended("e-1")]), SessionState.initial());

		const snapshot = await storage.findSnapshot(ID);
		expect(snapshot?.revision.value).toBe(1);
		expect(snapshot?.state.isAwaitingApproval).toBe(true);
	});

	it("signs what it writes, so rehydration accepts it", async () => {
		const storage = await storageWithSession();
		const manager = managerEvery(storage, 1);
		await manager.commit(
			ID,
			SessionRevision.initial(),
			SessionEventBatch.of([created("e-1"), new AgentTransferred(header("e-2"), SUPPORT, BILLING)]),
			SessionState.initial(),
		);

		const rehydrated = await manager.rehydrate(ID);

		expect(rehydrated.replayedFromSnapshot).toBe(true);
		expect(rehydrated.state.revision.value).toBe(2);
		expect(rehydrated.state.activeAgent?.value).toBe("billing");
	});

	it("keeps the run when the storage refuses the snapshot", async () => {
		const storage = new SnapshotRefusingStorage();
		await storage.create(Session.start(ID, SUPPORT, SessionMode.EPHEMERAL, NOW));
		const manager = managerEvery(storage, 1);

		const state = await manager.commit(
			ID,
			SessionRevision.initial(),
			SessionEventBatch.of([created("e-1")]),
			SessionState.initial(),
		);

		expect(state.revision.value).toBe(1);
		expect(await storage.findSnapshot(ID)).toBeUndefined();
	});

	it("never writes one for an empty batch", async () => {
		const storage = await storageWithSession();
		const manager = managerEvery(storage, 1);

		await manager.commit(ID, SessionRevision.initial(), SessionEventBatch.empty(), SessionState.initial());

		expect(await storage.findSnapshot(ID)).toBeUndefined();
	});
});

describe("SessionManager rehydrate", () => {
	it("replays the whole journal when there is no snapshot", async () => {
		const storage = await storageWithSession();
		const manager = new SessionManager(storage);
		await manager.commit(
			ID,
			SessionRevision.initial(),
			SessionEventBatch.of([created("e-1"), new AgentTransferred(header("e-2"), SUPPORT, BILLING)]),
			SessionState.initial(),
		);

		const rehydrated = await manager.rehydrate(ID);

		expect(rehydrated.replayedFromSnapshot).toBe(false);
		expect(rehydrated.state.revision.value).toBe(2);
		expect(rehydrated.state.activeAgent?.value).toBe("billing");
	});

	it("lands on the same state twice for the same journal", async () => {
		const storage = await storageWithSession();
		const manager = new SessionManager(storage);
		await manager.commit(ID, SessionRevision.initial(), SessionEventBatch.of([created("e-1")]), SessionState.initial());

		const checksum = new StateChecksum();
		const first = await manager.rehydrate(ID);
		const second = await manager.rehydrate(ID);

		expect(
			checksum.of(ID, StateProjector.VERSION, first.state).equals(checksum.of(ID, StateProjector.VERSION, second.state)),
		).toBe(true);
	});

	it("starts from a valid snapshot and replays only the tail", async () => {
		const storage = await storageWithSession();
		const manager = new SessionManager(storage);
		await manager.commit(
			ID,
			SessionRevision.initial(),
			SessionEventBatch.of([created("e-1"), new AgentTransferred(header("e-2"), SUPPORT, BILLING)]),
			SessionState.initial(),
		);

		const snapshotState = SessionState.initial().withActiveAgent(SUPPORT).at(SessionRevision.of(1));
		await storage.saveSnapshot(
			new SessionSnapshot(
				ID,
				SessionRevision.of(1),
				StateProjector.VERSION,
				snapshotState,
				new StateChecksum().of(ID, StateProjector.VERSION, snapshotState),
			),
		);

		const rehydrated = await manager.rehydrate(ID);

		expect(rehydrated.replayedFromSnapshot).toBe(true);
		expect(rehydrated.state.revision.value).toBe(2);
		expect(rehydrated.state.activeAgent?.value).toBe("billing");
	});

	it("falls back to a full replay when the snapshot came from another projector", async () => {
		const storage = await storageWithSession();
		const manager = new SessionManager(storage);
		await manager.commit(ID, SessionRevision.initial(), SessionEventBatch.of([created("e-1")]), SessionState.initial());

		const state = SessionState.initial().at(SessionRevision.of(1));
		await storage.saveSnapshot(
			new SessionSnapshot(ID, SessionRevision.of(1), 99, state, new StateChecksum().of(ID, 99, state)),
		);

		const rehydrated = await manager.rehydrate(ID);

		expect(rehydrated.replayedFromSnapshot).toBe(false);
		expect(rehydrated.state.activeAgent?.value).toBe("support");
		expect(await storage.findSnapshot(ID)).toBeDefined();
	});

	it("falls back to a full replay when the checksum does not match the state", async () => {
		const storage = await storageWithSession();
		const manager = new SessionManager(storage);
		await manager.commit(ID, SessionRevision.initial(), SessionEventBatch.of([created("e-1")]), SessionState.initial());

		const tampered = SessionState.initial().withActiveAgent(BILLING).at(SessionRevision.of(1));
		const wrongDigest = new StateChecksum().of(ID, StateProjector.VERSION, SessionState.initial());
		await storage.saveSnapshot(
			new SessionSnapshot(ID, SessionRevision.of(1), StateProjector.VERSION, tampered, wrongDigest),
		);

		const rehydrated = await manager.rehydrate(ID);

		expect(rehydrated.replayedFromSnapshot).toBe(false);
		expect(rehydrated.state.activeAgent?.value).toBe("support");
	});
});
