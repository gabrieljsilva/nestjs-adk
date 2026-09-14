import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { Instant } from "../../common/time/instant";
import { AppendEventsCommand } from "../../contracts/append-events-command";
import { AgentDefinition } from "../../domain/agent/agent-definition";
import { AgentDescription } from "../../domain/agent/agent-description";
import { AgentName } from "../../domain/agent/agent-name";
import { DeclaredAgent } from "../../domain/agent/declared-agent";
import { SessionEventBatch } from "../../domain/event/session-event-batch";
import type { ContextWindow } from "../../domain/model/context-window";
import { ModelContextWindow } from "../../domain/model/model-context-window";
import { ModelIdentity } from "../../domain/model/model-identity";
import { ModelUsage } from "../../domain/model/model-usage";
import { PromptMeasurement } from "../../domain/model/prompt-measurement";
import { UnknownContextWindow } from "../../domain/model/unknown-context-window";
import { SessionContext } from "../../domain/run/session-context";
import { SessionNotFoundError } from "../../domain/session/errors/session-not-found.error";
import { Session } from "../../domain/session/session";
import { JournalFixture } from "../../support/context/journal.fixture";
import { StubModel } from "../../support/model/stub-model.fixture";
import { AgentCatalog } from "../catalog/agent-catalog";
import { InspectSession } from "../session/inspect-session";
import { SessionManager } from "../session/session-manager";
import { InspectContextBudget } from "./inspect-context-budget";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SUPPORT = AgentName.from("support");
const CHAT = SessionId.from("chat-42");
/** The journal fixture answers for this model, so it is also the one the agent runs. */
const GEMINI = ModelIdentity.of("google", "gemini-flash");
const OTHER = ModelIdentity.of("google", "gemini-pro");

function catalogOf(window: ContextWindow = ModelContextWindow.of(1000, 200)): AgentCatalog {
	const definition = AgentDefinition.of(
		SUPPORT,
		AgentDescription.from("answers customers", "support"),
		new StubModel(window, GEMINI),
	);
	return AgentCatalog.of([new DeclaredAgent(definition, "SupportAgent")]);
}

function measurementOf(inputTokens: number, model = GEMINI): PromptMeasurement {
	const measurement = PromptMeasurement.from(ModelUsage.of(inputTokens, 20), 1000, model);
	if (measurement === undefined) throw new Error("the fixture asked for a measurement of nothing");
	return measurement;
}

/** A conversation as its journal left it: asked once, answered once, measured or not. */
async function storageWith(measurement?: PromptMeasurement): Promise<InMemorySessionStorage> {
	const journal = new JournalFixture(CHAT).user("hi").assistant("hello", measurement);
	const storage = new InMemorySessionStorage();
	await storage.create(SessionContext.fromSessionId(CHAT), Session.start(CHAT, SUPPORT, NOW));
	await storage.append(
		SessionContext.fromSessionId(CHAT),
		new AppendEventsCommand(
			CHAT,
			SessionRevision.initial(),
			SessionEventBatch.of(journal.events.map((stored) => stored.event)),
		),
	);
	return storage;
}

function readerOf(storage: InMemorySessionStorage, catalog = catalogOf()): InspectContextBudget {
	return new InspectContextBudget(new InspectSession(new SessionManager(storage)), catalog);
}

describe("InspectContextBudget", () => {
	it("answers the window of the agent, for a conversation no provider has counted", async () => {
		const budget = await readerOf(await storageWith()).handle(SUPPORT, CHAT);

		expect(budget.window.inputCapacity).toBe(800);
		expect(budget.isMeasured).toBe(false);
		expect(budget.usedTokens).toBeUndefined();
	});

	it("answers how full the window was on the last call a provider counted", async () => {
		const budget = await readerOf(await storageWith(measurementOf(400))).handle(SUPPORT, CHAT);

		expect(budget.usedTokens?.tokens).toBe(400);
		expect(budget.projectedUsedShare).toBeCloseTo(0.5, 5);
		expect(budget.projectedFreeTokens).toBe(400);
	});

	/** Nothing was sent since, so the meter is not scaling the measurement by anything. */
	it("describes the measured call itself, not a prompt nobody has built", async () => {
		const budget = await readerOf(await storageWith(measurementOf(400))).handle(SUPPORT, CHAT);

		expect(budget.characters).toBe(1000);
		expect(budget.projectedTokens).toBe(400);
	});

	/**
	 * Tokens counted by one provider divided by another one's window is a wrong number that
	 * looks right, so the conversation reads as unmeasured until this model answers once.
	 */
	it("refuses a measurement another model took", async () => {
		const budget = await readerOf(await storageWith(measurementOf(400, OTHER))).handle(SUPPORT, CHAT);

		expect(budget.isWindowKnown).toBe(true);
		expect(budget.isMeasured).toBe(false);
		expect(budget.usedTokens).toBeUndefined();
	});

	it("answers a measured size and no free room when the model never declared a window", async () => {
		const reader = readerOf(await storageWith(measurementOf(400)), catalogOf(new UnknownContextWindow()));

		const budget = await reader.handle(SUPPORT, CHAT);

		expect(budget.isWindowKnown).toBe(false);
		expect(budget.usedTokens?.tokens).toBe(400);
		expect(budget.projectedFreeTokens).toBeUndefined();
	});

	it("refuses an identifier no conversation uses, rather than answering an empty window", async () => {
		const reading = readerOf(await storageWith()).handle(SUPPORT, SessionId.from("nobody"));

		await expect(reading).rejects.toBeInstanceOf(SessionNotFoundError);
	});
});
