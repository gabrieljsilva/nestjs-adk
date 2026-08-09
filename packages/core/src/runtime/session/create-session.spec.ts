import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { SessionId } from "../../common/identity/session-id";
import { Instant } from "../../common/time/instant";
import { AgentName } from "../../domain/agent/agent-name";
import { CreateSessionInput } from "../../domain/session/create-session-input";
import { SessionAlreadyExistsError } from "../../domain/session/errors/session-already-exists.error";
import { FakeClock } from "../../support/fake-clock";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { CreateSession } from "./create-session";
import { SessionManager } from "./session-manager";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SUPPORT = AgentName.from("support");

function creatorOf(storage: InMemorySessionStorage): CreateSession {
	return new CreateSession(new SessionManager(storage), new FakeClock(NOW), new SequenceIdGenerator("s"));
}

describe("CreateSession", () => {
	it("opens the conversation under the identifier the application chose", async () => {
		const storage = new InMemorySessionStorage();

		const session = await creatorOf(storage).handle(SUPPORT, CreateSessionInput.of("chat-42"));

		expect(session.id.value).toBe("chat-42");
		expect(await storage.find(SessionId.from("chat-42"))).toBeDefined();
	});

	it("names the conversation itself when the caller chose nothing", async () => {
		const storage = new InMemorySessionStorage();

		const session = await creatorOf(storage).handle(SUPPORT, CreateSessionInput.of());

		expect(session.id.value).toBe("s-1");
		expect(await storage.find(session.id)).toBeDefined();
	});

	it("roots the conversation at the agent that opened it", async () => {
		const session = await creatorOf(new InMemorySessionStorage()).handle(SUPPORT, CreateSessionInput.of("chat-42"));

		expect(session.rootAgent.equals(SUPPORT)).toBe(true);
	});

	it("records the owner, so every question after it belongs to the same person", async () => {
		const session = await creatorOf(new InMemorySessionStorage()).handle(
			SUPPORT,
			CreateSessionInput.of("chat-42", "gabriel"),
		);

		expect(session.owner?.value).toBe("gabriel");
	});

	it("opens the conversation at the beginning of its journal, with nothing written in it", async () => {
		const session = await creatorOf(new InMemorySessionStorage()).handle(SUPPORT, CreateSessionInput.of("chat-42"));

		expect(session.revision.value).toBe(0);
		expect(session.createdAt.toIso()).toBe(NOW.toIso());
	});

	it("refuses an identifier that already names a conversation, rather than joining it", async () => {
		const storage = new InMemorySessionStorage();
		const creating = creatorOf(storage);
		await creating.handle(SUPPORT, CreateSessionInput.of("chat-42"));

		const error = await creating.handle(SUPPORT, CreateSessionInput.of("chat-42")).catch((reason) => reason);

		expect(error).toBeInstanceOf(SessionAlreadyExistsError);
	});
});
