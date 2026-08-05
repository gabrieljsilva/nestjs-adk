import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { SessionStore } from "../abstracts/session-store";
import { Agent } from "../decorators/agent.decorator";
import { AdkModule } from "../module/adk.module";
import { InMemorySessionStore } from "../stores/in-memory-session-store";
import { ScriptedEngine, text } from "../testing/scripted-engine";
import type { SessionEvent } from "../types/events";

/**
 * Store that OWNS the user's message: the app persisted the turn before the run started, the way an
 * app whose message table predates the agent does. `appendEvent` drops what it already wrote.
 */
@Injectable()
class AppOwnedStore extends InMemorySessionStore {
	public readonly appended: SessionEvent[] = [];

	public override async appendEvent(sessionId: string, event: SessionEvent): Promise<void> {
		this.appended.push(event);
		await super.appendEvent(sessionId, event);
	}
}

@Agent({ name: "assistant", model: "scripted", description: "d", prompt: "p" })
class AssistantAgent extends AdkAgent {}

@Injectable()
class ChatService {
	constructor(public readonly assistant: AssistantAgent) {}
}

@Module({ providers: [AssistantAgent, ChatService] })
class FeatureModule {}

const SESSION = "chat-1";
const ASK_EVENT_ID = "ask-1";

function askEvent(id: string, text: string): SessionEvent {
	return { v: 1, id, at: 1, author: "user", type: "message", data: { text } };
}

describe("AgentRunner: a message the app already persisted", () => {
	let app: TestingModule;
	let engine: ScriptedEngine;
	let chat: ChatService;
	let store: AppOwnedStore;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [
				AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "scripted", session: AppOwnedStore }),
				FeatureModule,
			],
		}).compile();
		await app.init();
		engine = app.get(AdkEngine) as ScriptedEngine;
		chat = app.get(ChatService);
		store = app.get(SessionStore) as AppOwnedStore;

		await store.create({ id: SESSION, userId: "u1" });
		await store.appendEvent(SESSION, askEvent("older-1", "[Ana]: pergunta antiga"));
		await store.appendEvent(SESSION, {
			v: 1,
			id: "resp-1",
			at: 2,
			author: "agent",
			type: "message",
			data: { text: "resposta" },
		});
		await store.appendEvent(SESSION, askEvent(ASK_EVENT_ID, "[Ana]: a pergunta do turno"));
		store.appended.length = 0;
	});

	afterEach(async () => {
		await app.close();
	});

	it("drops the named event from the history, since the run resends it itself", async () => {
		engine.enqueue([text("ok")]);

		await chat.assistant.ask({
			sessionId: SESSION,
			userId: "u1",
			message: "[Ana]: a pergunta do turno",
			messageEventId: ASK_EVENT_ID,
		});

		const ids = engine.lastInput?.history?.map((event) => event.id);
		expect(ids).toEqual(["older-1", "resp-1"]);
	});

	it("returns the whole history when no event is named", async () => {
		engine.enqueue([text("ok")]);

		await chat.assistant.ask({ sessionId: SESSION, userId: "u1", message: "nova" });

		const ids = engine.lastInput?.history?.map((event) => event.id);
		expect(ids).toEqual(["older-1", "resp-1", ASK_EVENT_ID]);
	});

	it("does not write the message the app already stored", async () => {
		engine.enqueue([text("ok")]);

		await chat.assistant.ask({
			sessionId: SESSION,
			userId: "u1",
			message: "[Ana]: a pergunta do turno",
			messageEventId: ASK_EVENT_ID,
		});

		expect(store.appended.filter((event) => event.author === "user")).toEqual([]);
	});

	it("keeps writing the message when the app does not own it", async () => {
		engine.enqueue([text("ok")]);

		await chat.assistant.ask({ sessionId: SESSION, userId: "u1", message: "nova" });

		expect(store.appended.filter((event) => event.author === "user")).toHaveLength(1);
	});

	it("removes nothing for an id absent from the history, since exclusion is by id and not by position", async () => {
		engine.enqueue([text("ok")]);

		await chat.assistant.ask({
			sessionId: SESSION,
			userId: "u1",
			message: "nova",
			messageEventId: "nao-existe",
		});

		const ids = engine.lastInput?.history?.map((event) => event.id);
		expect(ids).toEqual(["older-1", "resp-1", ASK_EVENT_ID]);
	});

	it("has each concurrent turn exclude its own event and never the other's", async () => {
		await store.appendEvent(SESSION, askEvent("ask-2", "[Bia]: outra pergunta"));
		engine.enqueue([text("ok")]);

		await chat.assistant.ask({
			sessionId: SESSION,
			userId: "u1",
			message: "[Ana]: a pergunta do turno",
			messageEventId: ASK_EVENT_ID,
		});

		const ids = engine.lastInput?.history?.map((event) => event.id);
		expect(ids).toEqual(["older-1", "resp-1", "ask-2"]);
	});

	it("still persists the agent answer, since the app only owns the user message", async () => {
		engine.enqueue([text("ok")]);

		await chat.assistant.ask({
			sessionId: SESSION,
			userId: "u1",
			message: "[Ana]: a pergunta do turno",
			messageEventId: ASK_EVENT_ID,
		});

		expect(store.appended.filter((event) => event.author === "agent")).toHaveLength(1);
	});
});

describe("InMemorySessionStore: exclusion by id", () => {
	it("returns the history without the named event", async () => {
		const store = new InMemorySessionStore();
		await store.create({ id: SESSION, userId: "u1" });
		await store.appendEvent(SESSION, askEvent("e1", "a"));
		await store.appendEvent(SESSION, askEvent("e2", "b"));

		const session = await store.get(SESSION, { excludeEventId: "e2" });

		expect(session?.events.map((event) => event.id)).toEqual(["e1"]);
	});

	it("returns everything when given no option", async () => {
		const store = new InMemorySessionStore();
		await store.create({ id: SESSION, userId: "u1" });
		await store.appendEvent(SESSION, askEvent("e1", "a"));

		expect((await store.get(SESSION))?.events.map((event) => event.id)).toEqual(["e1"]);
	});
});
