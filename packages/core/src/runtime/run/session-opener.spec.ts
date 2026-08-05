import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { SessionId } from "../../common/identity/session-id";
import { Instant } from "../../common/time/instant";
import { AgentName } from "../../domain/agent/agent-name";
import { AskInput } from "../../domain/session/ask-input";
import { SessionClosedError } from "../../domain/session/errors/session-closed.error";
import { Session } from "../../domain/session/session";
import { SessionMode } from "../../domain/session/session-mode";
import { SessionStatus } from "../../domain/session/session-status";
import { FakeClock } from "../../support/fake-clock";
import { SessionManager } from "../session/session-manager";
import { AgentRunCommand } from "./agent-run-command";
import { SessionOpener } from "./session-opener";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SUPPORT = AgentName.from("support");
const SESSION = SessionId.from("s-1");

function openerOf(storage: InMemorySessionStorage): SessionOpener {
	return new SessionOpener(new SessionManager(storage), new FakeClock(NOW));
}

describe("SessionOpener", () => {
	it("starts a session for a command that names none, and says it is new", async () => {
		const storage = new InMemorySessionStorage();

		const opened = await openerOf(storage).open(new AgentRunCommand(SUPPORT, AskInput.of("hi")), SESSION);

		expect(opened.isNew).toBe(true);
		expect(await storage.find(SESSION)).toBeDefined();
	});

	it("continues the session a command names, without creating a second one", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(Session.start(SESSION, SUPPORT, SessionMode.EPHEMERAL, NOW));

		const opened = await openerOf(storage).open(new AgentRunCommand(SUPPORT, AskInput.of("again", SESSION)), SESSION);

		expect(opened.isNew).toBe(false);
		expect(opened.session.id.value).toBe(SESSION.value);
	});

	it("refuses a session that no longer accepts commands, before anything is written", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(Session.start(SESSION, SUPPORT, SessionMode.EPHEMERAL, NOW).withStatus(SessionStatus.CLOSED));

		const error = await openerOf(storage)
			.open(new AgentRunCommand(SUPPORT, AskInput.of("again", SESSION)), SESSION)
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(SessionClosedError);
	});

	it("refuses a session id that names nothing, rather than starting one behind the caller", async () => {
		const error = await openerOf(new InMemorySessionStorage())
			.open(new AgentRunCommand(SUPPORT, AskInput.of("again", SESSION)), SESSION)
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(Error);
	});
});
