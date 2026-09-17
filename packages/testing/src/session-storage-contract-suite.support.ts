import { strict as assert } from "node:assert";
import {
	AgentName,
	AppendEventsCommand,
	type ContextCheckpoint,
	ContractCase,
	ContractSuite,
	Instant,
	JournalCorruptedError,
	MetadataKey,
	Session,
	SessionAlreadyExistsError,
	SessionContext,
	type SessionEvent,
	SessionEventBatch,
	SessionId,
	SessionNotFoundError,
	SessionRevision,
	SessionRevisionConflictError,
	type SessionSnapshot,
	type SessionStorage,
	StorageCodecs,
	type StoredSessionEvent,
} from "@nestjs-adk/core";

const AGENT = AgentName.from("support");
const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const PROJECTOR_VERSION = 1;

/**
 * Every promise the `SessionStorage` port makes, as cases any runner drives.
 *
 * It yields `ContractCase` objects and asserts with `node:assert`, so vitest, jest and
 * `node:test` all drive it. It reads the storage's own `capabilities()` and demands only what
 * was claimed, and it is the same suite the shipped storages answer.
 */
export class SessionStorageContractSuite extends ContractSuite<SessionStorage> {
	public readonly port = "SessionStorage";

	private readonly codecs = StorageCodecs.standard();

	public cases(create: () => SessionStorage): ContractCase[] {
		const capabilities = create().capabilities();
		const shared = [
			...this.sharedCases(create),
			...(capabilities.snapshots ? this.snapshotCases(create) : []),
			...(capabilities.checkpoints ? this.checkpointCases(create) : []),
		];
		if (!capabilities.supportsConcurrentWriters) return shared;
		return [...shared, ...this.durableCases(create)];
	}

	private snapshotCases(create: () => SessionStorage): ContractCase[] {
		return [
			new ContractCase("brings a snapshot back meaning what it meant when it was written", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));
				await storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "e-1"));

				await storage.saveSnapshot(this.buildContext("s-1"), this.buildSnapshot("s-1", 1));

				const found = await storage.findSnapshot(this.buildContext("s-1"));
				assert.ok(found !== undefined, "a storage that declares snapshots must answer the one it was given");
				assert.equal(found.revision.value, 1, "a snapshot read at another revision is a session meaning something else");
				assert.equal(
					found.projectorVersion,
					PROJECTOR_VERSION,
					"the projector version is what makes a stale snapshot refusable",
				);
				assert.equal(
					found.state.metadata.find(MetadataKey.fromName("memberId")),
					"gabriel",
					"the durable metadata of a session must survive the shortcut to it",
				);
			}),
		];
	}

	private checkpointCases(create: () => SessionStorage): ContractCase[] {
		return [
			new ContractCase("keeps context checkpoints in a collection of their own", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));
				await storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "e-1"));

				await storage.saveCheckpoint(this.buildContext("s-1"), this.buildCheckpoint("s-1", 1, 1));

				assert.equal(
					await this.readHead(storage, "s-1"),
					1,
					"a checkpoint is not journal: writing one must not move the head of the session",
				);
				assert.deepEqual(
					await this.readRevisions(storage, "s-1"),
					[1],
					"a checkpoint must not appear among the events of the session",
				);
				assert.equal(
					(await storage.findCheckpoint(this.buildContext("s-1")))?.coveredRevision.value,
					1,
					"a checkpoint that was written must be readable back",
				);
			}),
			new ContractCase("writes the same checkpoint once, however often it is written", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));
				await storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "e-1"));

				await storage.saveCheckpoint(this.buildContext("s-1"), this.buildCheckpoint("s-1", 1, 1));
				await storage.saveCheckpoint(this.buildContext("s-1"), this.buildCheckpoint("s-1", 1, 1));

				assert.equal(
					(await storage.findCheckpoint(this.buildContext("s-1")))?.coveredRevision.value,
					1,
					"session, covered revision and strategy version identify a checkpoint: the same one twice is the same one",
				);
			}),
			new ContractCase("answers with the checkpoint that covers the most journal", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));
				await storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "e-1", "e-2"));

				await storage.saveCheckpoint(this.buildContext("s-1"), this.buildCheckpoint("s-1", 2, 1));
				await storage.saveCheckpoint(this.buildContext("s-1"), this.buildCheckpoint("s-1", 1, 1));

				assert.equal(
					(await storage.findCheckpoint(this.buildContext("s-1")))?.coveredRevision.value,
					2,
					"an older checkpoint arriving late must not replace the one that covers more",
				);
			}),
			new ContractCase("keeps the checkpoints of one session out of another", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));
				await storage.create(this.buildContext("s-2"), this.buildSession("s-2"));

				await storage.saveCheckpoint(this.buildContext("s-1"), this.buildCheckpoint("s-1", 0, 1));

				assert.equal(
					await storage.findCheckpoint(this.buildContext("s-2")),
					undefined,
					"a session with no checkpoint of its own must not read someone else's",
				);
			}),
		];
	}

	private sharedCases(create: () => SessionStorage): ContractCase[] {
		return [
			new ContractCase("round trips every event of the catalog, whatever its payload holds", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));

				await storage.append(
					this.buildContext("s-1"),
					new AppendEventsCommand(
						SessionId.from("s-1"),
						new SessionRevision(0),
						new SessionEventBatch([this.buildMetadataEvent("e-1"), this.buildMetadataDeletion("e-2")]),
					),
				);

				const journal = await this.readJournal(storage, "s-1");
				assert.deepEqual(
					journal.map((stored) => stored.event.type),
					["session.metadata-set", "session.metadata-deleted"],
					"an event must come back as the type it was written under",
				);
				assert.deepEqual(
					this.codecs.journal.encode(journal[0]?.event ?? this.buildMetadataEvent("e-1")).payload,
					{ key: "memberId", value: { tier: "gold", seats: 3, tags: ["a"], active: true, seat: null } },
					"a nested payload must come back byte for byte, or the state it folds into changes meaning",
				);
			}),
			new ContractCase("refuses a duplicated create and leaves the existing session untouched", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));
				await storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "e-1"));

				const failure = await this.captureError(() => storage.create(this.buildContext("s-1"), this.buildSession("s-1")));

				assert.ok(
					failure instanceof SessionAlreadyExistsError,
					"creating a session id that already exists must fail instead of overwriting a journal",
				);
				assert.equal(
					await this.readHead(storage, "s-1"),
					1,
					"the refused create must not rewind the session that was there",
				);
				assert.deepEqual(await this.readRevisions(storage, "s-1"), [1], "the refused create must not touch the journal");
			}),
			new ContractCase("assigns consecutive revisions to a batch in one operation", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));

				const result = await storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "e-1", "e-2", "e-3"));

				assert.deepEqual(
					result.committed.map((stored) => stored.revision.value),
					[1, 2, 3],
					"a batch is one operation: its events take the revisions right after the head, with no hole between them",
				);
				assert.equal(result.revision.value, 3, "the reported head must be the revision of the last committed event");
				assert.deepEqual(await this.readRevisions(storage, "s-1"), [1, 2, 3], "the journal must hold the whole batch");
				assert.equal(await this.readHead(storage, "s-1"), 3, "the session head must follow the journal");
			}),
			new ContractCase("streams events in revision order and honours afterRevision", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));
				await storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "e-1", "e-2", "e-3"));

				assert.deepEqual(
					await this.readRevisions(storage, "s-1", 0),
					[1, 2, 3],
					"a read from zero replays the journal in order",
				);
				assert.deepEqual(await this.readRevisions(storage, "s-1", 1), [2, 3], "afterRevision is exclusive");
				assert.deepEqual(await this.readRevisions(storage, "s-1", 3), [], "a read from the head replays nothing");
				assert.deepEqual(
					(await this.readJournal(storage, "s-1")).map((stored) => stored.event.id.value),
					["e-1", "e-2", "e-3"],
					"the order of the journal is the order the events were appended in",
				);
			}),
			new ContractCase("keeps the journal of one session out of another", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));
				await storage.create(this.buildContext("s-2"), this.buildSession("s-2"));

				await storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "e-1"));
				await storage.append(this.buildContext("s-2"), this.buildCommand("s-2", 0, "e-2"));

				assert.deepEqual(
					(await this.readJournal(storage, "s-1")).map((stored) => stored.event.id.value),
					["e-1"],
					"a session must only ever see its own events",
				);
				assert.deepEqual(
					(await this.readJournal(storage, "s-2")).map((stored) => stored.event.id.value),
					["e-2"],
					"a session must only ever see its own events",
				);
				assert.equal(await this.readHead(storage, "s-2"), 1, "each session counts revisions on its own");
			}),
			new ContractCase("removes head, journal and snapshot together, and forgives a missing session", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));
				await storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "e-1"));
				if (storage.capabilities().snapshots)
					await storage.saveSnapshot(this.buildContext("s-1"), this.buildSnapshot("s-1", 1));

				await storage.delete(this.buildContext("s-1"));

				assert.equal(await storage.find(this.buildContext("s-1")), undefined, "delete must remove the head");
				assert.equal(await storage.findSnapshot(this.buildContext("s-1")), undefined, "delete must remove the snapshot");
				assert.equal(
					await storage.findCheckpoint(this.buildContext("s-1")),
					undefined,
					"delete must remove the context checkpoints too",
				);
				const failure = await this.captureError(() => this.readJournal(storage, "s-1"));
				assert.ok(failure instanceof SessionNotFoundError, "the journal must go away with the session that owned it");
				await storage.delete(this.buildContext("s-1"));
			}),
			new ContractCase("never claims durable sessions while accepting a stale expected revision", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));
				await storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "e-1"));

				const stale = await this.captureError(() =>
					storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "e-2")),
				);
				if (stale !== undefined) return;

				assert.equal(
					storage.capabilities().supportsConcurrentWriters,
					false,
					"a storage that writes on a stale expectedRevision has no concurrency control and must declare itself ephemeral: two writers would overwrite each other in silence",
				);
			}),
		];
	}

	private durableCases(create: () => SessionStorage): ContractCase[] {
		return [
			new ContractCase("persists nothing and leaves the head alone when the expected revision is wrong", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));
				await storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "e-1"));

				const failure = await this.captureError(() =>
					storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "e-2")),
				);

				assert.ok(
					failure instanceof SessionRevisionConflictError,
					"a stale expectedRevision loses the race and is told so",
				);
				assert.deepEqual(await this.readRevisions(storage, "s-1"), [1], "the refused batch must leave zero events behind");
				assert.equal(await this.readHead(storage, "s-1"), 1, "a refused append must not move the head");
			}),
			new ContractCase("treats a retry of the same batch as already done", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));
				const batch = this.buildCommand("s-1", 0, "e-1", "e-2");

				const first = await storage.append(this.buildContext("s-1"), batch);
				const retry = await storage.append(this.buildContext("s-1"), batch);

				assert.equal(
					retry.revision.value,
					first.revision.value,
					"a retry answers with the revision the first attempt reached",
				);
				assert.deepEqual(
					await this.readRevisions(storage, "s-1"),
					[1, 2],
					"a retry writes nothing new: the events are already there",
				);
				assert.equal(await this.readHead(storage, "s-1"), first.revision.value, "a retry must not move the head");
			}),
			new ContractCase("refuses an event id that comes back carrying different content", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));
				await storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "e-1"));

				const failure = await this.captureError(() =>
					storage.append(
						this.buildContext("s-1"),
						new AppendEventsCommand(
							SessionId.from("s-1"),
							new SessionRevision(1),
							new SessionEventBatch([this.buildDifferentEvent("e-1")]),
						),
					),
				);

				assert.ok(
					failure instanceof JournalCorruptedError,
					"the same id with different content is not a retry, it is a journal that disagrees with itself",
				);
				assert.deepEqual(await this.readRevisions(storage, "s-1"), [1], "a corrupted append must write nothing");
			}),
			new ContractCase("gives exactly one winner to two appends racing on the same revision", async () => {
				const storage = create();
				await storage.create(this.buildContext("s-1"), this.buildSession("s-1"));

				const results = await Promise.allSettled([
					storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "a-1")),
					storage.append(this.buildContext("s-1"), this.buildCommand("s-1", 0, "b-1")),
				]);

				const committed = results.filter((result) => result.status === "fulfilled");
				assert.equal(committed.length, 1, "two appends expecting the same revision cannot both win");
				assert.deepEqual(
					await this.readRevisions(storage, "s-1"),
					[1],
					"the loser of the race must leave nothing in the journal",
				);
			}),
		];
	}

	private buildSession(sessionId: string): Session {
		return Session.start(SessionId.from(sessionId), AGENT, NOW);
	}

	private buildContext(sessionId: string): SessionContext {
		return SessionContext.fromSessionId(SessionId.from(sessionId));
	}

	private buildEvent(eventId: string, rootAgent: string = AGENT.value): SessionEvent {
		return this.codecs.journal.decode({
			eventId,
			type: "session.created",
			schemaVersion: 1,
			occurredAt: NOW.toIso(),
			runId: "r-1",
			agentId: "a-1",
			correlationId: "c-1",
			causationId: undefined,
			payload: { rootAgent, actorId: null },
		});
	}

	private buildMetadataEvent(eventId: string): SessionEvent {
		return this.codecs.journal.decode({
			eventId,
			type: "session.metadata-set",
			schemaVersion: 1,
			occurredAt: NOW.toIso(),
			runId: "r-1",
			agentId: "a-1",
			correlationId: "c-1",
			causationId: undefined,
			payload: { key: "memberId", value: { tier: "gold", seats: 3, tags: ["a"], active: true, seat: null } },
		});
	}

	private buildMetadataDeletion(eventId: string): SessionEvent {
		return this.codecs.journal.decode({
			eventId,
			type: "session.metadata-deleted",
			schemaVersion: 1,
			occurredAt: NOW.toIso(),
			runId: "r-1",
			agentId: "a-1",
			correlationId: "c-1",
			causationId: undefined,
			payload: { key: "memberId" },
		});
	}

	private buildDifferentEvent(eventId: string): SessionEvent {
		return this.buildEvent(eventId, "billing");
	}

	private buildCommand(sessionId: string, expectedRevision: number, ...eventIds: string[]): AppendEventsCommand {
		return new AppendEventsCommand(
			SessionId.from(sessionId),
			new SessionRevision(expectedRevision),
			new SessionEventBatch(eventIds.map((eventId) => this.buildEvent(eventId))),
		);
	}

	private buildSnapshot(sessionId: string, revision: number): SessionSnapshot {
		return this.codecs.snapshot.decode({
			sessionId,
			revision,
			projectorVersion: PROJECTOR_VERSION,
			checksumAlgorithm: "sha-256",
			checksumValue: "contract-suite",
			state: { revision, values: [], metadata: [["memberId", "gabriel"]] },
		});
	}

	private buildCheckpoint(sessionId: string, coveredRevision: number, strategyVersion: number): ContextCheckpoint {
		return this.codecs.checkpoint.decode({
			sessionId,
			coveredRevision,
			strategy: "contract-suite",
			strategyVersion,
			prefixDigestAlgorithm: "sha-256",
			prefixDigestValue: "contract-suite",
			blocks: [],
			composition: { sizes: [] },
			key: `${sessionId}:${coveredRevision}:${strategyVersion}`,
		});
	}

	private async readJournal(
		storage: SessionStorage,
		sessionId: string,
		afterRevision = 0,
	): Promise<StoredSessionEvent[]> {
		const events: StoredSessionEvent[] = [];
		for await (const stored of storage.readEvents(this.buildContext(sessionId), new SessionRevision(afterRevision))) {
			events.push(stored);
		}
		return events;
	}

	private async readRevisions(storage: SessionStorage, sessionId: string, afterRevision = 0): Promise<number[]> {
		const events = await this.readJournal(storage, sessionId, afterRevision);
		return events.map((stored) => stored.revision.value);
	}

	private async readHead(storage: SessionStorage, sessionId: string): Promise<number> {
		return (await storage.findOrFail(this.buildContext(sessionId))).revision.value;
	}

	private async captureError(work: () => Promise<unknown>): Promise<unknown> {
		try {
			await work();
		} catch (error) {
			return error;
		}
		return undefined;
	}
}
