import "reflect-metadata";
import { Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage.adapter";
import { SessionId } from "../../common/identity/session-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { SessionEventConsumer } from "../../contracts/events/session-event-consumer.contract";
import { SessionMetadataSet } from "../../domain/event/catalog/metadata/session-metadata-set.event";
import { SessionCreated } from "../../domain/event/catalog/session/session-created.event";
import { UserMessageReceived } from "../../domain/event/catalog/session/user-message-received.event";
import type { PublishedEvent } from "../../domain/event/published-event.value-object";
import type { SessionEvent } from "../../domain/event/session-event.event";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { SessionAlreadyExistsError } from "../../domain/session/errors/session-already-exists.error";
import { SessionNotFoundError } from "../../domain/session/errors/session-not-found.error";
import { MetadataKey } from "../../domain/session/metadata/metadata-key.value-object";
import { FakeClock } from "../../support/fake-clock.double";
import { RecordingModel } from "../../support/nest/recording-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { AdkAgent } from "./agent/adk-agent.edge";
import { Agent } from "./decorators/agent.decorator";
import { AdkModuleOptions } from "./module/adk-module.options";
import { ADK_EVENT_CONSUMERS, AdkModule } from "./module/adk.module";

const CHAT = "chat-42";
const MEMBER = MetadataKey.fromName<string>("memberId", (value): value is string => typeof value === "string");

@Agent({ name: "support", description: "Handles orders.", prompt: "Be brief." })
class SupportAgent extends AdkAgent {}

/**
 * Opening a conversation under an identifier the application already owns.
 *
 * The whole feature is about who names a conversation, so it is proved through the module
 * an application actually boots: the agent is reached the way a service reaches it, and
 * the journal underneath is read to check what each step did and did not write.
 */
describe("a conversation the application opens itself", () => {
	let app: TestingModule;
	let storage: InMemorySessionStorage;
	let published: string[];

	afterEach(async () => {
		await app?.close();
	});

	async function boot(): Promise<SupportAgent> {
		storage = new InMemorySessionStorage();
		published = [];
		const seen = published;

		class Recorder extends SessionEventConsumer {
			public readonly name = "recorder";
			public async consume(_context: SessionContext, event: PublishedEvent): Promise<void> {
				seen.push(event.type);
			}
		}

		@Module({ providers: [SupportAgent] })
		class FeatureModule {}

		app = await Test.createTestingModule({
			imports: [
				AdkModule.forRoot(
					new AdkModuleOptions(
						new RecordingModel("hello there"),
						storage,
						undefined,
						new FakeClock(),
						new SequenceIdGenerator(),
					),
				),
				FeatureModule,
			],
		})
			.overrideProvider(ADK_EVENT_CONSUMERS)
			.useValue([new Recorder()])
			.compile();
		app.enableShutdownHooks();
		await app.init();
		return app.get(SupportAgent);
	}

	async function readJournal(sessionId: string): Promise<SessionEvent[]> {
		const events: SessionEvent[] = [];
		for await (const stored of storage.readEvents(
			SessionContext.fromSessionId(SessionId.from(sessionId)),
			SessionRevision.initial(),
		)) {
			events.push(stored.event);
		}
		return events;
	}

	it("takes the identifier of the chat that was just created", async () => {
		const support = await boot();

		const session = await support.createSession({ sessionId: CHAT });

		expect(session.id.value).toBe(CHAT);
		expect((await support.findSessionById(CHAT))?.id.value).toBe(CHAT);
	});

	it("answers the first question as the beginning of that conversation", async () => {
		const support = await boot();
		await support.createSession({ sessionId: CHAT });

		const result = await support.ask("where is my order?", CHAT);

		expect(result.sessionId.value).toBe(CHAT);
		expect(result.text).toBe("hello there");
		expect((await readJournal(CHAT)).map((event) => event.type)).toContain(SessionCreated.TYPE);
	});

	it("records the beginning once, however many questions follow", async () => {
		const support = await boot();
		await support.createSession({ sessionId: CHAT });

		await support.ask("where is my order?", CHAT);
		await support.ask("and the other one?", CHAT);

		const beginnings = (await readJournal(CHAT)).filter((event) => event.type === SessionCreated.TYPE);
		expect(beginnings).toHaveLength(1);
	});

	it("names the conversation itself when the caller wants the identifier first", async () => {
		const support = await boot();

		const session = await support.createSession();

		expect(session.id.value.length).toBeGreaterThan(0);
		expect((await support.findSessionById(session.id))?.id.value).toBe(session.id.value);
	});

	/** Last write per key is what the journal folds to, so the newer question wins. */
	it("replaces a metadata key a later question names again", async () => {
		const support = await boot();
		await support.createSession({ sessionId: CHAT, metadata: { memberId: "gabriel" } });

		await support.ask("where is my order?", { sessionId: CHAT, metadata: { memberId: "somebody-else" } });

		expect((await support.inspect(CHAT)).metadata.find(MEMBER)).toBe("somebody-else");
	});

	it("keeps the metadata a conversation was opened with when a question says nothing about it", async () => {
		const support = await boot();
		await support.createSession({ sessionId: CHAT, metadata: { memberId: "gabriel" } });

		await support.ask("where is my order?", CHAT);

		expect((await support.inspect(CHAT)).metadata.find(MEMBER)).toBe("gabriel");
	});

	it("carries the metadata into the journal, where a consumer reads it", async () => {
		const support = await boot();
		await support.createSession({ sessionId: CHAT });

		await support.ask("where is my order?", { sessionId: CHAT, metadata: { memberId: "gabriel" } });

		const written = (await readJournal(CHAT)).find((event) => event instanceof SessionMetadataSet);
		expect(written).toBeInstanceOf(SessionMetadataSet);
		if (!(written instanceof SessionMetadataSet)) return;
		expect(written.key).toBe("memberId");
		expect(written.value).toBe("gabriel");
	});

	it("still records the conversation beginning after a session opened with metadata", async () => {
		const support = await boot();
		await support.createSession({ sessionId: CHAT, metadata: { memberId: "gabriel" } });

		await support.ask("where is my order?", CHAT);

		expect((await readJournal(CHAT)).filter((event) => event instanceof SessionCreated)).toHaveLength(1);
	});

	it("refuses to open the same chat twice, leaving the conversation it already has", async () => {
		const support = await boot();
		await support.createSession({ sessionId: CHAT, metadata: { memberId: "gabriel" } });
		await support.ask("where is my order?", CHAT);

		const error = await support
			.createSession({ sessionId: CHAT, metadata: { memberId: "somebody-else" } })
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(SessionAlreadyExistsError);
		expect((await support.inspect(CHAT)).metadata.find(MEMBER)).toBe("gabriel");
		expect((await readJournal(CHAT)).map((event) => event.type)).toContain(UserMessageReceived.TYPE);
	});

	it("still refuses a question naming a conversation nobody opened", async () => {
		const support = await boot();

		const error = await support.ask("where is my order?", "never-opened").catch((reason) => reason);

		expect(error).toBeInstanceOf(SessionNotFoundError);
	});

	it("answers nothing for an identifier no conversation uses", async () => {
		const support = await boot();

		expect(await support.findSessionById("never-opened")).toBeUndefined();
	});

	it("refuses the same absence for a caller that demands a conversation", async () => {
		const support = await boot();

		const error = await support.findSessionByIdOrFail("never-opened").catch((reason) => reason);

		expect(error).toBeInstanceOf(SessionNotFoundError);
	});

	it("answers which agent roots an open conversation and that it takes commands", async () => {
		const support = await boot();
		await support.createSession({ sessionId: CHAT });

		const session = await support.findSessionByIdOrFail(CHAT);

		expect(session.rootAgent.value).toBe("support");
		expect(session.acceptsCommands).toBe(true);
	});

	it("stands at its agent with nothing pending while nothing has been asked", async () => {
		const support = await boot();
		await support.createSession({ sessionId: CHAT });

		const inspection = await support.inspect(CHAT);

		expect(inspection.activeAgent.value).toBe("support");
		expect(inspection.isAwaitingApproval).toBe(false);
		expect(inspection.revision.value).toBe(0);
	});

	it("tells observers nothing until the first question, because nothing happened yet", async () => {
		const support = await boot();

		await support.createSession({ sessionId: CHAT });

		expect(published).toEqual([]);
		expect(await readJournal(CHAT)).toEqual([]);
	});
});
