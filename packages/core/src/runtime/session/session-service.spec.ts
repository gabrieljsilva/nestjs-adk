import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { SessionId } from "../../common/identity/session-id";
import { Instant } from "../../common/time/instant";
import { AgentDefinition } from "../../domain/agent/agent-definition";
import { AgentDescription } from "../../domain/agent/agent-description";
import { AgentName } from "../../domain/agent/agent-name";
import { DeclaredAgent } from "../../domain/agent/declared-agent";
import { ModelContextWindow } from "../../domain/model/model-context-window";
import { CreateSessionInput } from "../../domain/session/create-session-input";
import { SessionNotFoundError } from "../../domain/session/errors/session-not-found.error";
import { FakeClock } from "../../support/fake-clock";
import { StubModel } from "../../support/model/stub-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { AgentCatalog } from "../catalog/agent-catalog";
import { InspectContextBudget } from "../context/inspect-context-budget";
import { CreateSession } from "./create-session";
import { InspectSession } from "./inspect-session";
import { SessionManager } from "./session-manager";
import { SessionService } from "./session-service";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SUPPORT = AgentName.from("support");
const MISSING = SessionId.from("nobody");

function catalogOf(): AgentCatalog {
	const definition = AgentDefinition.of(
		SUPPORT,
		AgentDescription.from("answers customers", "support"),
		new StubModel(ModelContextWindow.of(1000, 200)),
	);
	return AgentCatalog.of([new DeclaredAgent(definition, "SupportAgent")]);
}

function serviceOf(storage: InMemorySessionStorage = new InMemorySessionStorage()): SessionService {
	const sessions = new SessionManager(storage);
	const inspecting = new InspectSession(sessions);
	return new SessionService(
		new CreateSession(sessions, new FakeClock(NOW), new SequenceIdGenerator("s")),
		inspecting,
		sessions,
		new InspectContextBudget(inspecting, catalogOf()),
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

	it("answers the window of the agent for a conversation nobody has asked anything in", async () => {
		const service = serviceOf();
		await service.create(SUPPORT, CreateSessionInput.of("chat-42"));

		const budget = await service.budget(SUPPORT, SessionId.from("chat-42"));

		expect(budget.window.inputCapacity).toBe(800);
		expect(budget.isMeasured).toBe(false);
	});
});
