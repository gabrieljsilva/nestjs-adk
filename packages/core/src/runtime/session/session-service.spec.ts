import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { SessionId } from "../../common/identity/session-id";
import { Instant } from "../../common/time/instant";
import { AgentName } from "../../domain/agent/agent-name";
import { CreateSessionInput } from "../../domain/session/create-session-input";
import { SessionNotFoundError } from "../../domain/session/errors/session-not-found.error";
import { FakeClock } from "../../support/fake-clock";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { CreateSession } from "./create-session";
import { InspectSession } from "./inspect-session";
import { SessionManager } from "./session-manager";
import { SessionService } from "./session-service";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SUPPORT = AgentName.from("support");
const MISSING = SessionId.from("nobody");

function serviceOf(storage: InMemorySessionStorage = new InMemorySessionStorage()): SessionService {
	const sessions = new SessionManager(storage);
	return new SessionService(
		new CreateSession(sessions, new FakeClock(NOW), new SequenceIdGenerator("s")),
		new InspectSession(sessions),
		sessions,
	);
}

describe("SessionService", () => {
	it("opens a conversation under the identifier it was given", async () => {
		const service = serviceOf();

		const session = await service.create(SUPPORT, CreateSessionInput.of("chat-42", "gabriel"));

		expect(session.id.value).toBe("chat-42");
		expect(session.owner?.value).toBe("gabriel");
	});

	it("finds a conversation by identifier, reading only its head", async () => {
		const service = serviceOf();
		await service.create(SUPPORT, CreateSessionInput.of("chat-42"));

		const found = await service.find(SessionId.from("chat-42"));

		expect(found?.rootAgent.equals(SUPPORT)).toBe(true);
	});

	it("answers nothing for an identifier no conversation uses", async () => {
		expect(await serviceOf().find(MISSING)).toBeUndefined();
	});

	it("refuses an identifier no conversation uses when the caller demands one", async () => {
		const error = await serviceOf()
			.findOrFail(MISSING)
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(SessionNotFoundError);
	});

	it("inspects a conversation that was opened and never asked anything", async () => {
		const service = serviceOf();
		await service.create(SUPPORT, CreateSessionInput.of("chat-42"));

		const inspection = await service.inspect(SessionId.from("chat-42"));

		expect(inspection.activeAgent.equals(SUPPORT)).toBe(true);
		expect(inspection.isAwaitingApproval).toBe(false);
	});
});
