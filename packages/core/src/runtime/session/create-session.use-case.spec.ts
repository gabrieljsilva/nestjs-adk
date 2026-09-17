import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage.adapter";
import { SessionId } from "../../common/identity/session-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { Instant } from "../../common/time/instant.value-object";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { SessionMetadataSet } from "../../domain/event/catalog/metadata/session-metadata-set.event";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { SessionAlreadyExistsError } from "../../domain/session/errors/session-already-exists.error";
import { CreateSessionInput } from "../../domain/session/input/create-session-input.command";
import { FakeClock } from "../../support/fake-clock.double";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { ActiveRunTracker } from "../lifecycle/active-run-tracker.service";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle.service";
import { ShutdownOptions } from "../lifecycle/shutdown.options";
import { AgentRunFactory } from "../run/agent-run.factory";
import { RunEventFactory } from "../run/journal/run-event.factory";
import { RunJournal } from "../run/journal/run-journal.service";
import { CreateSession } from "./create-session.use-case";
import { SessionManager } from "./session-manager.service";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SUPPORT = AgentName.from("support");

function creatorOf(storage: InMemorySessionStorage): CreateSession {
	const clock = new FakeClock(NOW);
	const ids = new SequenceIdGenerator("s");
	const tracker = new ActiveRunTracker();
	const lifecycle = new RuntimeLifecycle(tracker, ShutdownOptions.waitIndefinitely(), clock);
	return new CreateSession(
		new SessionManager(storage),
		clock,
		ids,
		new AgentRunFactory(new SequenceIdGenerator("run"), clock, tracker, lifecycle),
		new RunJournal(new RunEventFactory(new SequenceIdGenerator("e"), clock)),
	);
}

describe("CreateSession", () => {
	it("opens the conversation under the identifier the application chose", async () => {
		const storage = new InMemorySessionStorage();

		const session = await creatorOf(storage).handle(SUPPORT, CreateSessionInput.fromOptions("chat-42"));

		expect(session.id.value).toBe("chat-42");
		expect(await storage.find(SessionContext.fromSessionId(SessionId.from("chat-42")))).toBeDefined();
	});

	it("names the conversation itself when the caller chose nothing", async () => {
		const storage = new InMemorySessionStorage();

		const session = await creatorOf(storage).handle(SUPPORT, CreateSessionInput.fromOptions());

		expect(session.id.value).toBe("s-1");
		expect(await storage.find(SessionContext.fromSessionId(session.id))).toBeDefined();
	});

	it("roots the conversation at the agent that opened it", async () => {
		const session = await creatorOf(new InMemorySessionStorage()).handle(
			SUPPORT,
			CreateSessionInput.fromOptions("chat-42"),
		);

		expect(session.rootAgent.equals(SUPPORT)).toBe(true);
	});

	/** There is nowhere else a durable fact could live before the first question is asked. */
	it("writes the metadata it was opened with as events of the run that opened it", async () => {
		const storage = new InMemorySessionStorage();

		const session = await creatorOf(storage).handle(
			SUPPORT,
			CreateSessionInput.fromOptions("chat-42", { memberId: "gabriel" }),
		);

		expect(session.revision.value).toBe(1);
		const events = [];
		for await (const stored of storage.readEvents(SessionContext.fromSessionId(session.id), SessionRevision.initial()))
			events.push(stored.event);
		expect(events).toHaveLength(1);
		expect(events[0]).toBeInstanceOf(SessionMetadataSet);
	});

	it("writes nothing at all when the caller declared no metadata", async () => {
		const session = await creatorOf(new InMemorySessionStorage()).handle(
			SUPPORT,
			CreateSessionInput.fromOptions("chat-42"),
		);

		expect(session.revision.value).toBe(0);
		expect(session.createdAt.toIso()).toBe(NOW.toIso());
	});

	it("refuses an identifier that already names a conversation, rather than joining it", async () => {
		const storage = new InMemorySessionStorage();
		const creating = creatorOf(storage);
		await creating.handle(SUPPORT, CreateSessionInput.fromOptions("chat-42"));

		const error = await creating.handle(SUPPORT, CreateSessionInput.fromOptions("chat-42")).catch((reason) => reason);

		expect(error).toBeInstanceOf(SessionAlreadyExistsError);
	});
});
