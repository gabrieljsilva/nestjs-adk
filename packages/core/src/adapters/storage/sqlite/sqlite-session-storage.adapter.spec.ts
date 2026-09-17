import { describe, expect, it } from "vitest";
import { ContentDigest } from "../../../common/digest/content-digest.value-object";
import { AgentId } from "../../../common/identity/agent-id.value-object";
import { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import { CorrelationId } from "../../../common/identity/correlation-id.value-object";
import { EventId } from "../../../common/identity/event-id.value-object";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { SessionRevision } from "../../../common/revision/session-revision.value-object";
import { Instant } from "../../../common/time/instant.value-object";
import { AppendEventsCommand } from "../../../contracts/storage/append-events.command";
import { AgentName } from "../../../domain/agent/agent-name.value-object";
import { ContextCheckpoint } from "../../../domain/context/context-checkpoint.value-object";
import { SessionCreated } from "../../../domain/event/catalog/session/session-created.event";
import { UserMessageReceived } from "../../../domain/event/catalog/session/user-message-received.event";
import { EventCorrelation } from "../../../domain/event/event-correlation.value-object";
import { EventHeader } from "../../../domain/event/event-header.value-object";
import { SessionEventBatch } from "../../../domain/event/session-event-batch.value-object";
import { SessionContext } from "../../../domain/run/session-context.value-object";
import { SessionNotFoundError } from "../../../domain/session/errors/session-not-found.error";
import { SessionRevisionConflictError } from "../../../domain/session/errors/session-revision-conflict.error";
import { Session } from "../../../domain/session/session.entity";
import { UnsupportedStorageFeatureError } from "./errors/unsupported-storage-feature.error";
import { SqliteSessionStorage } from "./sqlite-session-storage.adapter";

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
	return Session.start(ID, AGENT, NOW);
}

function checkpointOf(): ContextCheckpoint {
	return new ContextCheckpoint(ID, SessionRevision.of(1), "oldest-first", 1, ContentDigest.of("sha256", "abc"), []);
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
function ctx(id = "s-1"): SessionContext {
	return SessionContext.fromSessionId(SessionId.from(id));
}

describe("SqliteSessionStorage", () => {
	it("declares durable sessions with snapshots and without checkpoints", () => {
		const capabilities = new SqliteSessionStorage().capabilities();

		expect(capabilities.supportsConcurrentWriters).toBe(true);
		expect(capabilities.snapshots).toBe(true);
		expect(capabilities.checkpoints).toBe(false);
	});

	it("refuses a checkpoint instead of accepting one it would drop", async () => {
		const storage = new SqliteSessionStorage();
		await storage.create(ctx(), sessionOf());

		await expect(storage.findCheckpoint()).resolves.toBeUndefined();
		await expect(storage.saveCheckpoint(ctx(), checkpointOf())).rejects.toBeInstanceOf(UnsupportedStorageFeatureError);
	});

	it("reads back an event through the same codec that wrote it", async () => {
		const storage = new SqliteSessionStorage();
		await storage.create(ctx(), sessionOf());

		await storage.append(
			ctx(),
			new AppendEventsCommand(
				ID,
				SessionRevision.initial(),
				SessionEventBatch.of([new UserMessageReceived(header("e-1"), "how long do I have?")]),
			),
		);

		const read = [];
		for await (const stored of storage.readEvents(ctx(), SessionRevision.initial())) read.push(stored);
		const first = read[0]?.event;
		expect(first).toBeInstanceOf(UserMessageReceived);
		expect(first instanceof UserMessageReceived ? first.text : "").toBe("how long do I have?");
	});

	it("survives being reopened, which is the whole point of being durable", async () => {
		const storage = new SqliteSessionStorage();
		await storage.create(ctx(), sessionOf());
		await storage.append(ctx(), new AppendEventsCommand(ID, SessionRevision.initial(), batchOf("e-1", "e-2")));

		const head = await storage.findOrFail(ctx());
		expect(head.revision.value).toBe(2);
		expect(head.rootAgent.value).toBe("support");
	});

	it("writes nothing at all when one event of a batch cannot be written", async () => {
		const storage = new SqliteSessionStorage();
		await storage.create(ctx(), sessionOf());
		await storage.append(ctx(), new AppendEventsCommand(ID, SessionRevision.initial(), batchOf("e-1")));

		await expect(
			storage.append(ctx(), new AppendEventsCommand(ID, SessionRevision.of(1), batchOf("e-2", "e-1"))),
		).rejects.toThrow();

		expect((await storage.findOrFail(ctx())).revision.value).toBe(1);
	});

	it("refuses a stale expected revision", async () => {
		const storage = new SqliteSessionStorage();
		await storage.create(ctx(), sessionOf());
		await storage.append(ctx(), new AppendEventsCommand(ID, SessionRevision.initial(), batchOf("e-1")));

		await expect(
			storage.append(ctx(), new AppendEventsCommand(ID, SessionRevision.initial(), batchOf("e-2"))),
		).rejects.toBeInstanceOf(SessionRevisionConflictError);
	});

	it("refuses to read the journal of a session it never had", async () => {
		const storage = new SqliteSessionStorage();

		await expect(
			(async () => {
				for await (const stored of storage.readEvents(ctx(), SessionRevision.initial())) return stored;
				return undefined;
			})(),
		).rejects.toBeInstanceOf(SessionNotFoundError);
	});
});
