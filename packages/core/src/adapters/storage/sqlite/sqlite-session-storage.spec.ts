import { describe, expect, it } from "vitest";
import { ContentDigest } from "../../../common/digest/content-digest";
import { AgentId } from "../../../common/identity/agent-id";
import { AgentRunId } from "../../../common/identity/agent-run-id";
import { CorrelationId } from "../../../common/identity/correlation-id";
import { EventId } from "../../../common/identity/event-id";
import { SessionId } from "../../../common/identity/session-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { Instant } from "../../../common/time/instant";
import { AppendEventsCommand } from "../../../contracts/append-events-command";
import { AgentName } from "../../../domain/agent/agent-name";
import { ContextCheckpoint } from "../../../domain/context/context-checkpoint";
import { ContextComposition } from "../../../domain/context/context-composition";
import { SessionCreated } from "../../../domain/event/catalog/session-created";
import { UserMessageReceived } from "../../../domain/event/catalog/user-message-received";
import { EventCorrelation } from "../../../domain/event/event-correlation";
import { EventHeader } from "../../../domain/event/event-header";
import { SessionEventBatch } from "../../../domain/event/session-event-batch";
import { SessionNotFoundError } from "../../../domain/session/errors/session-not-found.error";
import { SessionRevisionConflictError } from "../../../domain/session/errors/session-revision-conflict.error";
import { Session } from "../../../domain/session/session";
import { SessionMode } from "../../../domain/session/session-mode";
import { UnsupportedStorageFeatureError } from "./errors/unsupported-storage-feature.error";
import { SqliteSessionStorage } from "./sqlite-session-storage";

const AGENT = AgentName.from("support");
const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const ID = SessionId.from("s-1");

function header(id: string): EventHeader {
	return new EventHeader(
		EventId.from(id),
		NOW,
		new EventCorrelation(AgentRunId.from("r-1"), AgentId.from("a-1"), CorrelationId.from("c-1")),
	);
}

function sessionOf(): Session {
	return Session.start(ID, AGENT, SessionMode.EPHEMERAL, NOW);
}

function checkpointOf(): ContextCheckpoint {
	return new ContextCheckpoint(
		ID,
		SessionRevision.of(1),
		"oldest-first",
		1,
		ContentDigest.of("sha256", "abc"),
		[],
		ContextComposition.empty(),
	);
}

function batchOf(...ids: readonly string[]): SessionEventBatch {
	return SessionEventBatch.of(ids.map((id) => new SessionCreated(header(id), AGENT, undefined)));
}

/**
 * The port contract is not checked here. It lives in `@nestjs-adk/testing`, where
 * `SessionStorageContractSuite` runs it against this adapter and the in memory one
 * together, so both are held to the same cases. What stays here is what only this
 * adapter has to answer for: its capabilities, its file, and its SQL.
 */
describe("SqliteSessionStorage", () => {
	it("declares durable sessions with snapshots and without checkpoints", () => {
		const capabilities = new SqliteSessionStorage().capabilities();

		expect(capabilities.supportsDurableSessions).toBe(true);
		expect(capabilities.snapshots).toBe(true);
		expect(capabilities.checkpoints).toBe(false);
	});

	it("refuses a checkpoint instead of accepting one it would drop", async () => {
		const storage = new SqliteSessionStorage();
		await storage.create(sessionOf());

		await expect(storage.findCheckpoint()).resolves.toBeUndefined();
		await expect(storage.saveCheckpoint(checkpointOf())).rejects.toBeInstanceOf(UnsupportedStorageFeatureError);
	});

	it("reads back an event through the same codec that wrote it", async () => {
		const storage = new SqliteSessionStorage();
		await storage.create(sessionOf());

		await storage.append(
			new AppendEventsCommand(
				ID,
				SessionRevision.initial(),
				SessionEventBatch.of([new UserMessageReceived(header("e-1"), "how long do I have?")]),
			),
		);

		const read = [];
		for await (const stored of storage.readEvents(ID, SessionRevision.initial())) read.push(stored);
		const first = read[0]?.event;
		expect(first).toBeInstanceOf(UserMessageReceived);
		expect(first instanceof UserMessageReceived ? first.text : "").toBe("how long do I have?");
	});

	it("survives being reopened, which is the whole point of being durable", async () => {
		const storage = new SqliteSessionStorage();
		await storage.create(sessionOf());
		await storage.append(new AppendEventsCommand(ID, SessionRevision.initial(), batchOf("e-1", "e-2")));

		const head = await storage.findOrFail(ID);
		expect(head.revision.value).toBe(2);
		expect(head.rootAgent.value).toBe("support");
	});

	it("writes nothing at all when one event of a batch cannot be written", async () => {
		const storage = new SqliteSessionStorage();
		await storage.create(sessionOf());
		await storage.append(new AppendEventsCommand(ID, SessionRevision.initial(), batchOf("e-1")));

		await expect(
			storage.append(new AppendEventsCommand(ID, SessionRevision.of(1), batchOf("e-2", "e-1"))),
		).rejects.toThrow();

		expect((await storage.findOrFail(ID)).revision.value).toBe(1);
	});

	it("refuses a stale expected revision", async () => {
		const storage = new SqliteSessionStorage();
		await storage.create(sessionOf());
		await storage.append(new AppendEventsCommand(ID, SessionRevision.initial(), batchOf("e-1")));

		await expect(
			storage.append(new AppendEventsCommand(ID, SessionRevision.initial(), batchOf("e-2"))),
		).rejects.toBeInstanceOf(SessionRevisionConflictError);
	});

	it("refuses to read the journal of a session it never had", async () => {
		const storage = new SqliteSessionStorage();

		await expect(
			(async () => {
				for await (const stored of storage.readEvents(ID, SessionRevision.initial())) return stored;
				return undefined;
			})(),
		).rejects.toBeInstanceOf(SessionNotFoundError);
	});
});
