import { describe, expect, it } from "vitest";
import { AgentId } from "../../common/identity/agent-id";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { CorrelationId } from "../../common/identity/correlation-id";
import { EventId } from "../../common/identity/event-id";
import { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { Instant } from "../../common/time/instant";
import { AppendEventsCommand } from "../../contracts/append-events-command";
import { AgentName } from "../../domain/agent/agent-name";
import { SessionCreated } from "../../domain/event/catalog/session-created";
import { EventCorrelation } from "../../domain/event/event-correlation";
import { EventHeader } from "../../domain/event/event-header";
import { SessionEventBatch } from "../../domain/event/session-event-batch";
import { JournalCorruptedError } from "../../domain/session/errors/journal-corrupted.error";
import { SessionAlreadyExistsError } from "../../domain/session/errors/session-already-exists.error";
import { SessionNotFoundError } from "../../domain/session/errors/session-not-found.error";
import { SessionRevisionConflictError } from "../../domain/session/errors/session-revision-conflict.error";
import { Session } from "../../domain/session/session";
import { SessionMode } from "../../domain/session/session-mode";
import { InMemorySessionStorage } from "./in-memory-session-storage";

const AGENT = AgentName.from("support");
const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");

function session(id = "s-1"): Session {
	return Session.start(SessionId.from(id), AGENT, SessionMode.EPHEMERAL, NOW);
}

function headerOf(id: string): EventHeader {
	return new EventHeader(
		EventId.from(id),
		NOW,
		new EventCorrelation(AgentRunId.from("r-1"), AgentId.from("a-1"), CorrelationId.from("c-1")),
	);
}

function event(id: string): SessionCreated {
	return new SessionCreated(headerOf(id), AGENT, undefined);
}

function append(sessionId: string, expected: number, ...ids: string[]): AppendEventsCommand {
	return new AppendEventsCommand(
		SessionId.from(sessionId),
		SessionRevision.of(expected),
		SessionEventBatch.of(ids.map(event)),
	);
}

async function collect(storage: InMemorySessionStorage, id: string, after = 0): Promise<number[]> {
	const revisions: number[] = [];
	for await (const stored of storage.readEvents(SessionId.from(id), SessionRevision.of(after))) {
		revisions.push(stored.revision.value);
	}
	return revisions;
}

describe("InMemorySessionStorage", () => {
	it("declares itself durable with snapshot support", () => {
		const capabilities = new InMemorySessionStorage().capabilities();

		expect(capabilities.supportsDurableSessions).toBe(true);
		expect(capabilities.snapshots).toBe(true);
	});

	it("refuses to create the same session twice and keeps the first one", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(session());

		await expect(storage.create(session())).rejects.toBeInstanceOf(SessionAlreadyExistsError);
		expect((await storage.findOrFail(SessionId.from("s-1"))).revision.value).toBe(0);
	});

	it("fails to find a session that was never created", async () => {
		const storage = new InMemorySessionStorage();

		expect(await storage.find(SessionId.from("nope"))).toBeUndefined();
		await expect(storage.findOrFail(SessionId.from("nope"))).rejects.toBeInstanceOf(SessionNotFoundError);
	});

	it("assigns consecutive revisions to a batch in one operation", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(session());

		const result = await storage.append(append("s-1", 0, "e-1", "e-2", "e-3"));

		expect(result.committed.map((stored) => stored.revision.value)).toEqual([1, 2, 3]);
		expect(result.revision.value).toBe(3);
		expect((await storage.findOrFail(SessionId.from("s-1"))).revision.value).toBe(3);
	});

	it("writes nothing and leaves the head alone when the expected revision is wrong", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(session());
		await storage.append(append("s-1", 0, "e-1"));

		await expect(storage.append(append("s-1", 0, "e-2"))).rejects.toBeInstanceOf(SessionRevisionConflictError);

		expect((await storage.findOrFail(SessionId.from("s-1"))).revision.value).toBe(1);
		expect(await collect(storage, "s-1")).toEqual([1]);
	});

	it("treats a retry of the same batch as already done", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(session());
		const batch = append("s-1", 0, "e-1", "e-2");

		const first = await storage.append(batch);
		const retry = await storage.append(batch);

		expect(retry.revision.value).toBe(first.revision.value);
		expect(await collect(storage, "s-1")).toEqual([1, 2]);
	});

	it("rejects an event id that comes back carrying different content", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(session());
		await storage.append(append("s-1", 0, "e-1"));

		const divergent = new AppendEventsCommand(
			SessionId.from("s-1"),
			SessionRevision.of(1),
			SessionEventBatch.of([new SessionCreated(headerOf("e-1"), AgentName.from("billing"), undefined)]),
		);

		await expect(storage.append(divergent)).rejects.toBeInstanceOf(JournalCorruptedError);
	});

	it("gives exactly one winner to two appends racing on the same revision", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(session());

		const results = await Promise.allSettled([
			storage.append(append("s-1", 0, "a-1")),
			storage.append(append("s-1", 0, "b-1")),
		]);

		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
		expect(await collect(storage, "s-1")).toEqual([1]);
	});

	it("does not let one session block another", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(session("s-1"));
		await storage.create(session("s-2"));

		const [first, second] = await Promise.all([
			storage.append(append("s-1", 0, "e-1")),
			storage.append(append("s-2", 0, "e-2")),
		]);

		expect(first.revision.value).toBe(1);
		expect(second.revision.value).toBe(1);
	});

	it("streams events after a revision, in order", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(session());
		await storage.append(append("s-1", 0, "e-1", "e-2", "e-3"));

		expect(await collect(storage, "s-1", 1)).toEqual([2, 3]);
	});

	it("streams lazily, without materializing the journal", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(session());
		await storage.append(append("s-1", 0, "e-1", "e-2", "e-3"));

		const iterator = storage.readEvents(SessionId.from("s-1"), SessionRevision.initial())[Symbol.asyncIterator]();
		const first = await iterator.next();

		expect(first.done).toBe(false);
		expect(first.value?.revision.value).toBe(1);
	});

	it("removes head, journal and snapshot together, and forgives a missing session", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(session());
		await storage.append(append("s-1", 0, "e-1"));

		await storage.delete(SessionId.from("s-1"));

		expect(await storage.find(SessionId.from("s-1"))).toBeUndefined();
		expect(await storage.findSnapshot(SessionId.from("s-1"))).toBeUndefined();
		await expect(storage.delete(SessionId.from("s-1"))).resolves.toBeUndefined();
	});

	it("refuses to store a snapshot for a session it does not know", async () => {
		const storage = new InMemorySessionStorage();
		await expect(
			storage.readEvents(SessionId.from("ghost"), SessionRevision.initial())[Symbol.asyncIterator]().next(),
		).rejects.toBeInstanceOf(SessionNotFoundError);
	});
});
