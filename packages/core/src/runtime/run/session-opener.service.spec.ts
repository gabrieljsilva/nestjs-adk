import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage.adapter";
import { AgentId } from "../../common/identity/agent-id.value-object";
import { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { CorrelationId } from "../../common/identity/correlation-id.value-object";
import { EventId } from "../../common/identity/event-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { Instant } from "../../common/time/instant.value-object";
import { AppendEventsCommand } from "../../contracts/storage/append-events.command";
import { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import { AgentDescription } from "../../domain/agent/agent-description.value-object";
import { AgentExecutionPolicies } from "../../domain/agent/agent-execution-policies.value-object";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { DeclaredAgent } from "../../domain/agent/declared-agent.value-object";
import { SessionCreated } from "../../domain/event/catalog/session/session-created.event";
import { AgentTransferred } from "../../domain/event/catalog/transfer/agent-transferred.event";
import { EventCorrelation } from "../../domain/event/event-correlation.value-object";
import { EventHeader } from "../../domain/event/event-header.value-object";
import { SessionEventBatch } from "../../domain/event/session-event-batch.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { SessionClosedError } from "../../domain/session/errors/session-closed.error";
import { AskInput } from "../../domain/session/input/ask-input.command";
import { SessionStatus } from "../../domain/session/session-status.value-object";
import { Session } from "../../domain/session/session.entity";
import { FakeClock } from "../../support/fake-clock.double";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { AgentCatalog } from "../catalog/agent-catalog.service";
import { SessionRepository } from "../session/session-repository.service";
import { AgentRunCommand } from "./agent-run.command";
import { SessionOpener } from "./session-opener.service";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SUPPORT = AgentName.from("support");
const SESSION = SessionId.from("s-1");

const BILLING = AgentName.from("billing");

function definitionNamed(name: AgentName): AgentDefinition {
	return new AgentDefinition({
		name: name,
		description: AgentDescription.from("An agent", name.value),
		model: new ScriptedModel(name.value),
		policies: new AgentExecutionPolicies(),
	});
}

function openerOf(storage: InMemorySessionStorage): SessionOpener {
	return new SessionOpener(
		new SessionRepository(storage),
		new FakeClock(NOW),
		new AgentCatalog([
			new DeclaredAgent(definitionNamed(SUPPORT), "SupportAgent"),
			new DeclaredAgent(definitionNamed(BILLING), "BillingAgent"),
		]),
		new SequenceIdGenerator("s"),
	);
}

/** A handover recorded in the journal, which is what moves ownership of the conversation. */
async function transferJournalOf(storage: InMemorySessionStorage): Promise<void> {
	const correlation = new EventCorrelation(AgentRunId.from("r-1"), AgentId.from("support"), CorrelationId.from("c-1"));
	await storage.append(
		SessionContext.fromSessionId(SESSION),
		new AppendEventsCommand(
			SESSION,
			SessionRevision.initial(),
			new SessionEventBatch([
				new SessionCreated(new EventHeader(EventId.from("e-1"), NOW, correlation), SUPPORT, undefined),
				new AgentTransferred(new EventHeader(EventId.from("e-2"), NOW, correlation), SUPPORT, BILLING),
			]),
		),
	);
}

/** A journal that has begun is one holding the beginning, which is what names an active agent. */
async function beginJournalOf(storage: InMemorySessionStorage): Promise<void> {
	const header = new EventHeader(
		EventId.from("e-1"),
		NOW,
		new EventCorrelation(AgentRunId.from("r-1"), AgentId.from("support"), CorrelationId.from("c-1")),
	);
	await storage.append(
		SessionContext.fromSessionId(SESSION),
		new AppendEventsCommand(
			SESSION,
			SessionRevision.initial(),
			new SessionEventBatch([new SessionCreated(header, SUPPORT, undefined)]),
		),
	);
}

describe("SessionOpener", () => {
	it("starts a session for a command that names none, and says it is new", async () => {
		const storage = new InMemorySessionStorage();

		const opened = await openerOf(storage).open(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi"),
			}),
			SESSION,
		);

		expect(opened.isNew).toBe(true);
		expect(await storage.find(SessionContext.fromSessionId(SESSION))).toBeDefined();
	});

	it("continues the session a command names, without creating a second one", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(SessionContext.fromSessionId(SESSION), Session.start(SESSION, SUPPORT, NOW));
		await beginJournalOf(storage);

		const opened = await openerOf(storage).open(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("again", SESSION),
			}),
			SESSION,
		);

		expect(opened.isNew).toBe(false);
		expect(opened.session.id.value).toBe(SESSION.value);
	});

	it("treats a session opened ahead of time as one whose journal still has to begin", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(SessionContext.fromSessionId(SESSION), Session.start(SESSION, SUPPORT, NOW));

		const opened = await openerOf(storage).open(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("first", SESSION),
			}),
			SESSION,
		);

		expect(opened.isNew).toBe(true);
	});

	it("refuses a session that no longer accepts commands, before anything is written", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(
			SessionContext.fromSessionId(SESSION),
			Session.start(SESSION, SUPPORT, NOW).withStatus(SessionStatus.CLOSED),
		);

		const error = await openerOf(storage)
			.open(
				new AgentRunCommand({
					agent: SUPPORT,
					input: AskInput.fromMessage("again", SESSION),
				}),
				SESSION,
			)
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(SessionClosedError);
	});

	it("refuses a session id that names nothing, rather than starting one behind the caller", async () => {
		const error = await openerOf(new InMemorySessionStorage())
			.open(
				new AgentRunCommand({
					agent: SUPPORT,
					input: AskInput.fromMessage("again", SESSION),
				}),
				SESSION,
			)
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(Error);
	});

	it("enters a new conversation under a generated id, with the agent the caller reached for", async () => {
		const entry = await openerOf(new InMemorySessionStorage()).enter(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hello"),
			}),
		);

		expect(entry.agent.name.value).toBe("support");
		expect(entry.session).toBeUndefined();
		expect(entry.sessionId.value).not.toBe("");
	});

	it("enters an existing conversation under the id the command named, reading it once", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(SessionContext.fromSessionId(SESSION), Session.start(SESSION, SUPPORT, NOW));
		await beginJournalOf(storage);

		const entry = await openerOf(storage).enter(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi", SESSION),
			}),
		);

		expect(entry.sessionId).toBe(SESSION);
		expect(entry.agent.name.value).toBe("support");
		expect(entry.session?.isNew).toBe(false);
	});

	it("answers as the agent the session belongs to now, not the handle the caller held", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(SessionContext.fromSessionId(SESSION), Session.start(SESSION, SUPPORT, NOW));
		await transferJournalOf(storage);

		const entry = await openerOf(storage).enter(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi", SESSION),
			}),
		);

		expect(entry.agent.name.value).toBe("billing");
	});

	it("opens the session the entry already read instead of reading it twice", async () => {
		const storage = new InMemorySessionStorage();
		await storage.create(SessionContext.fromSessionId(SESSION), Session.start(SESSION, SUPPORT, NOW));
		await beginJournalOf(storage);
		const opener = openerOf(storage);
		const command = new AgentRunCommand({
			agent: SUPPORT,
			input: AskInput.fromMessage("hi", SESSION),
		});
		const entry = await opener.enter(command);

		expect(await opener.openEntry(command, entry)).toBe(entry.session);
	});
});
