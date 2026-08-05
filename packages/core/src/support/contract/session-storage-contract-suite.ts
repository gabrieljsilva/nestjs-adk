import { strict as assert } from "node:assert";
import { ContentDigest } from "../../common/digest/content-digest";
import { AgentId } from "../../common/identity/agent-id";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { CorrelationId } from "../../common/identity/correlation-id";
import { EventId } from "../../common/identity/event-id";
import { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { Instant } from "../../common/time/instant";
import { AppendEventsCommand } from "../../contracts/append-events-command";
import type { SessionStorage } from "../../contracts/session-storage";
import { AgentName } from "../../domain/agent/agent-name";
import { ContextCheckpoint } from "../../domain/context/context-checkpoint";
import { ContextComposition } from "../../domain/context/context-composition";
import { SessionCreated } from "../../domain/event/catalog/session-created";
import { EventCorrelation } from "../../domain/event/event-correlation";
import { EventHeader } from "../../domain/event/event-header";
import type { SessionEvent } from "../../domain/event/session-event";
import { SessionEventBatch } from "../../domain/event/session-event-batch";
import type { StoredSessionEvent } from "../../domain/event/stored-session-event";
import { JournalCorruptedError } from "../../domain/session/errors/journal-corrupted.error";
import { SessionAlreadyExistsError } from "../../domain/session/errors/session-already-exists.error";
import { SessionNotFoundError } from "../../domain/session/errors/session-not-found.error";
import { SessionRevisionConflictError } from "../../domain/session/errors/session-revision-conflict.error";
import { Session } from "../../domain/session/session";
import { SessionMode } from "../../domain/session/session-mode";
import { SessionSnapshot } from "../../domain/session/session-snapshot";
import { SessionState } from "../../domain/session/session-state";
import { ContractCase } from "./contract-case";
import { ContractSuite } from "./contract-suite";

const AGENT = AgentName.from("support");
const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const PROJECTOR_VERSION = 1;

/**
 * Every promise the `SessionStorage` port makes, as cases any adapter has to answer.
 *
 * The four guarantees of the port are checked from the outside only, through the port
 * itself, so a durable adapter downstream is measured by the same cases as the in memory
 * reference. Optimistic concurrency and idempotency are only demanded from an adapter
 * that declared them: a storage honest about being ephemeral is not held to what it
 * never promised, but one that claims durability while accepting a stale expected
 * revision is caught by a case that always runs.
 */
export class SessionStorageContractSuite extends ContractSuite<SessionStorage> {
	public readonly port = "SessionStorage";

	public cases(create: () => SessionStorage): ContractCase[] {
		const capabilities = create().capabilities();
		const shared = [...this.sharedCases(create), ...(capabilities.checkpoints ? this.checkpointCases(create) : [])];
		if (!capabilities.supportsDurableSessions) return shared;
		return [...shared, ...this.durableCases(create)];
	}

	/** Only for an adapter that said it keeps compaction checkpoints. */
	private checkpointCases(create: () => SessionStorage): ContractCase[] {
		return [
			new ContractCase("keeps context checkpoints in a collection of their own", async () => {
				const storage = create();
				await storage.create(this.sessionOf("s-1"));
				await storage.append(this.commandOf("s-1", 0, "e-1"));

				await storage.saveCheckpoint(this.checkpointOf("s-1", 1, 1));

				assert.equal(
					await this.headOf(storage, "s-1"),
					1,
					"a checkpoint is not journal: writing one must not move the head of the session",
				);
				assert.deepEqual(
					await this.revisionsOf(storage, "s-1"),
					[1],
					"a checkpoint must not appear among the events of the session",
				);
				assert.equal(
					(await storage.findCheckpoint(SessionId.from("s-1")))?.coveredRevision.value,
					1,
					"a checkpoint that was written must be readable back",
				);
			}),
			new ContractCase("writes the same checkpoint once, however often it is written", async () => {
				const storage = create();
				await storage.create(this.sessionOf("s-1"));
				await storage.append(this.commandOf("s-1", 0, "e-1"));

				await storage.saveCheckpoint(this.checkpointOf("s-1", 1, 1));
				await storage.saveCheckpoint(this.checkpointOf("s-1", 1, 1));

				assert.equal(
					(await storage.findCheckpoint(SessionId.from("s-1")))?.coveredRevision.value,
					1,
					"session, covered revision and strategy version identify a checkpoint: the same one twice is the same one",
				);
			}),
			new ContractCase("answers with the checkpoint that covers the most journal", async () => {
				const storage = create();
				await storage.create(this.sessionOf("s-1"));
				await storage.append(this.commandOf("s-1", 0, "e-1", "e-2"));

				await storage.saveCheckpoint(this.checkpointOf("s-1", 2, 1));
				await storage.saveCheckpoint(this.checkpointOf("s-1", 1, 1));

				assert.equal(
					(await storage.findCheckpoint(SessionId.from("s-1")))?.coveredRevision.value,
					2,
					"an older checkpoint arriving late must not replace the one that covers more",
				);
			}),
			new ContractCase("keeps the checkpoints of one session out of another", async () => {
				const storage = create();
				await storage.create(this.sessionOf("s-1"));
				await storage.create(this.sessionOf("s-2"));

				await storage.saveCheckpoint(this.checkpointOf("s-1", 0, 1));

				assert.equal(
					await storage.findCheckpoint(SessionId.from("s-2")),
					undefined,
					"a session with no checkpoint of its own must not read someone else's",
				);
			}),
		];
	}

	/** What every adapter owes, whatever it claims to support. */
	private sharedCases(create: () => SessionStorage): ContractCase[] {
		return [
			new ContractCase("refuses a duplicated create and leaves the existing session untouched", async () => {
				const storage = create();
				await storage.create(this.sessionOf("s-1"));
				await storage.append(this.commandOf("s-1", 0, "e-1"));

				const failure = await this.errorOf(() => storage.create(this.sessionOf("s-1")));

				assert.ok(
					failure instanceof SessionAlreadyExistsError,
					"creating a session id that already exists must fail instead of overwriting a journal",
				);
				assert.equal(await this.headOf(storage, "s-1"), 1, "the refused create must not rewind the session that was there");
				assert.deepEqual(await this.revisionsOf(storage, "s-1"), [1], "the refused create must not touch the journal");
			}),
			new ContractCase("assigns consecutive revisions to a batch in one operation", async () => {
				const storage = create();
				await storage.create(this.sessionOf("s-1"));

				const result = await storage.append(this.commandOf("s-1", 0, "e-1", "e-2", "e-3"));

				assert.deepEqual(
					result.committed.map((stored) => stored.revision.value),
					[1, 2, 3],
					"a batch is one operation: its events take the revisions right after the head, with no hole between them",
				);
				assert.equal(result.revision.value, 3, "the reported head must be the revision of the last committed event");
				assert.deepEqual(await this.revisionsOf(storage, "s-1"), [1, 2, 3], "the journal must hold the whole batch");
				assert.equal(await this.headOf(storage, "s-1"), 3, "the session head must follow the journal");
			}),
			new ContractCase("streams events in revision order and honours afterRevision", async () => {
				const storage = create();
				await storage.create(this.sessionOf("s-1"));
				await storage.append(this.commandOf("s-1", 0, "e-1", "e-2", "e-3"));

				assert.deepEqual(
					await this.revisionsOf(storage, "s-1", 0),
					[1, 2, 3],
					"a read from zero replays the journal in order",
				);
				assert.deepEqual(await this.revisionsOf(storage, "s-1", 1), [2, 3], "afterRevision is exclusive");
				assert.deepEqual(await this.revisionsOf(storage, "s-1", 3), [], "a read from the head replays nothing");
				assert.deepEqual(
					(await this.journalOf(storage, "s-1")).map((stored) => stored.event.id.value),
					["e-1", "e-2", "e-3"],
					"the order of the journal is the order the events were appended in",
				);
			}),
			new ContractCase("keeps the journal of one session out of another", async () => {
				const storage = create();
				await storage.create(this.sessionOf("s-1"));
				await storage.create(this.sessionOf("s-2"));

				await storage.append(this.commandOf("s-1", 0, "e-1"));
				await storage.append(this.commandOf("s-2", 0, "e-2"));

				assert.deepEqual(
					(await this.journalOf(storage, "s-1")).map((stored) => stored.event.id.value),
					["e-1"],
					"a session must only ever see its own events",
				);
				assert.deepEqual(
					(await this.journalOf(storage, "s-2")).map((stored) => stored.event.id.value),
					["e-2"],
					"a session must only ever see its own events",
				);
				assert.equal(await this.headOf(storage, "s-2"), 1, "each session counts revisions on its own");
			}),
			new ContractCase("removes head, journal and snapshot together, and forgives a missing session", async () => {
				const storage = create();
				await storage.create(this.sessionOf("s-1"));
				await storage.append(this.commandOf("s-1", 0, "e-1"));
				if (storage.capabilities().snapshots) await storage.saveSnapshot(this.snapshotOf("s-1", 1));

				await storage.delete(SessionId.from("s-1"));

				assert.equal(await storage.find(SessionId.from("s-1")), undefined, "delete must remove the head");
				assert.equal(await storage.findSnapshot(SessionId.from("s-1")), undefined, "delete must remove the snapshot");
				assert.equal(
					await storage.findCheckpoint(SessionId.from("s-1")),
					undefined,
					"delete must remove the context checkpoints too",
				);
				const failure = await this.errorOf(() => this.journalOf(storage, "s-1"));
				assert.ok(failure instanceof SessionNotFoundError, "the journal must go away with the session that owned it");
				await storage.delete(SessionId.from("s-1"));
			}),
			new ContractCase("never claims durable sessions while accepting a stale expected revision", async () => {
				const storage = create();
				await storage.create(this.sessionOf("s-1"));
				await storage.append(this.commandOf("s-1", 0, "e-1"));

				const stale = await this.errorOf(() => storage.append(this.commandOf("s-1", 0, "e-2")));
				if (stale !== undefined) return;

				assert.equal(
					storage.capabilities().supportsDurableSessions,
					false,
					"a storage that writes on a stale expectedRevision has no concurrency control and must declare itself ephemeral: two writers would overwrite each other in silence",
				);
			}),
		];
	}

	/** What only an adapter claiming durable sessions is held to. */
	private durableCases(create: () => SessionStorage): ContractCase[] {
		return [
			new ContractCase("persists nothing and leaves the head alone when the expected revision is wrong", async () => {
				const storage = create();
				await storage.create(this.sessionOf("s-1"));
				await storage.append(this.commandOf("s-1", 0, "e-1"));

				const failure = await this.errorOf(() => storage.append(this.commandOf("s-1", 0, "e-2")));

				assert.ok(
					failure instanceof SessionRevisionConflictError,
					"a stale expectedRevision loses the race and is told so",
				);
				assert.deepEqual(await this.revisionsOf(storage, "s-1"), [1], "the refused batch must leave zero events behind");
				assert.equal(await this.headOf(storage, "s-1"), 1, "a refused append must not move the head");
			}),
			new ContractCase("treats a retry of the same batch as already done", async () => {
				const storage = create();
				await storage.create(this.sessionOf("s-1"));
				const batch = this.commandOf("s-1", 0, "e-1", "e-2");

				const first = await storage.append(batch);
				const retry = await storage.append(batch);

				assert.equal(
					retry.revision.value,
					first.revision.value,
					"a retry answers with the revision the first attempt reached",
				);
				assert.deepEqual(
					await this.revisionsOf(storage, "s-1"),
					[1, 2],
					"a retry writes nothing new: the events are already there",
				);
				assert.equal(await this.headOf(storage, "s-1"), first.revision.value, "a retry must not move the head");
			}),
			new ContractCase("refuses an event id that comes back carrying different content", async () => {
				const storage = create();
				await storage.create(this.sessionOf("s-1"));
				await storage.append(this.commandOf("s-1", 0, "e-1"));

				const failure = await this.errorOf(() =>
					storage.append(
						new AppendEventsCommand(
							SessionId.from("s-1"),
							SessionRevision.of(1),
							SessionEventBatch.of([this.differentEventOf("e-1")]),
						),
					),
				);

				assert.ok(
					failure instanceof JournalCorruptedError,
					"the same id with different content is not a retry, it is a journal that disagrees with itself",
				);
				assert.deepEqual(await this.revisionsOf(storage, "s-1"), [1], "a corrupted append must write nothing");
			}),
			new ContractCase("gives exactly one winner to two appends racing on the same revision", async () => {
				const storage = create();
				await storage.create(this.sessionOf("s-1"));

				const results = await Promise.allSettled([
					storage.append(this.commandOf("s-1", 0, "a-1")),
					storage.append(this.commandOf("s-1", 0, "b-1")),
				]);

				const committed = results.filter((result) => result.status === "fulfilled");
				assert.equal(committed.length, 1, "two appends expecting the same revision cannot both win");
				assert.deepEqual(
					await this.revisionsOf(storage, "s-1"),
					[1],
					"the loser of the race must leave nothing in the journal",
				);
			}),
		];
	}

	private sessionOf(sessionId: string): Session {
		return Session.start(SessionId.from(sessionId), AGENT, SessionMode.EPHEMERAL, NOW);
	}

	/** A fresh instance every call, so two commands never share an event object by accident. */
	private eventOf(eventId: string): SessionEvent {
		const header = new EventHeader(
			EventId.from(eventId),
			NOW,
			new EventCorrelation(AgentRunId.from("r-1"), AgentId.from("a-1"), CorrelationId.from("c-1")),
		);
		return new SessionCreated(header, AGENT, undefined);
	}

	/** The same id carrying something else, which is what a journal must never accept twice. */
	private differentEventOf(eventId: string): SessionEvent {
		const header = new EventHeader(
			EventId.from(eventId),
			NOW,
			new EventCorrelation(AgentRunId.from("r-1"), AgentId.from("a-1"), CorrelationId.from("c-1")),
		);
		return new SessionCreated(header, AgentName.from("billing"), undefined);
	}

	private commandOf(sessionId: string, expectedRevision: number, ...eventIds: string[]): AppendEventsCommand {
		return new AppendEventsCommand(
			SessionId.from(sessionId),
			SessionRevision.of(expectedRevision),
			SessionEventBatch.of(eventIds.map((eventId) => this.eventOf(eventId))),
		);
	}

	private snapshotOf(sessionId: string, revision: number): SessionSnapshot {
		return new SessionSnapshot(
			SessionId.from(sessionId),
			SessionRevision.of(revision),
			PROJECTOR_VERSION,
			SessionState.initial(),
			ContentDigest.of("sha-256", "contract-suite"),
		);
	}

	private checkpointOf(sessionId: string, coveredRevision: number, strategyVersion: number): ContextCheckpoint {
		return new ContextCheckpoint(
			SessionId.from(sessionId),
			SessionRevision.of(coveredRevision),
			"contract-suite",
			strategyVersion,
			ContentDigest.of("sha-256", "contract-suite"),
			[],
			ContextComposition.empty(),
		);
	}

	private async journalOf(storage: SessionStorage, sessionId: string, afterRevision = 0): Promise<StoredSessionEvent[]> {
		const events: StoredSessionEvent[] = [];
		for await (const stored of storage.readEvents(SessionId.from(sessionId), SessionRevision.of(afterRevision))) {
			events.push(stored);
		}
		return events;
	}

	private async revisionsOf(storage: SessionStorage, sessionId: string, afterRevision = 0): Promise<number[]> {
		const events = await this.journalOf(storage, sessionId, afterRevision);
		return events.map((stored) => stored.revision.value);
	}

	private async headOf(storage: SessionStorage, sessionId: string): Promise<number> {
		return (await storage.findOrFail(SessionId.from(sessionId))).revision.value;
	}

	/** The error the work threw, or undefined when it went through, so a case can assert on both. */
	private async errorOf(work: () => Promise<unknown>): Promise<unknown> {
		try {
			await work();
		} catch (error) {
			return error;
		}
		return undefined;
	}
}
