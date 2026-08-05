import { beforeEach, describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { AgentName } from "../../domain/agent/agent-name";
import { SequentialFailoverPolicy } from "../../domain/agent/sequential-failover-policy";
import { AgentRunCompleted } from "../../domain/event/catalog/agent-run-completed";
import { AgentRunFailed } from "../../domain/event/catalog/agent-run-failed";
import { AgentRunStarted } from "../../domain/event/catalog/agent-run-started";
import { AssistantMessageProduced } from "../../domain/event/catalog/assistant-message-produced";
import { ModelRerouted } from "../../domain/event/catalog/model-rerouted";
import { SessionCreated } from "../../domain/event/catalog/session-created";
import { UserMessageReceived } from "../../domain/event/catalog/user-message-received";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ModelUsage } from "../../domain/model/model-usage";
import { AgentRunStatus } from "../../domain/session/agent-run-status";
import { AskInput } from "../../domain/session/ask-input";
import { SessionClosedError } from "../../domain/session/errors/session-closed.error";
import { SessionStatus } from "../../domain/session/session-status";
import { NativeStackFixture } from "../../support/run/native-stack.fixture";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { AgentRunCommand } from "./agent-run-command";

const SUPPORT = NativeStackFixture.AGENT;

let harness: NativeStackFixture;

beforeEach(() => {
	harness = new NativeStackFixture(new ScriptedModel("primary"));
});

describe("AskAgent", () => {
	it("answers with the text the model produced, on a session it created", async () => {
		const result = await harness.asking.handle(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		expect(result.text).toBe("hello");
		expect(result.status.equals(AgentRunStatus.COMPLETED)).toBe(true);
		expect(await harness.storage.find(result.sessionId)).toBeDefined();
	});

	it("journals the question before the answer, and the answer with the end of the run", async () => {
		const result = await harness.asking.handle(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		const types = (await harness.journalOf(result.sessionId)).map((event) => event.type);
		expect(types).toEqual([
			SessionCreated.TYPE,
			UserMessageReceived.TYPE,
			AgentRunStarted.TYPE,
			AssistantMessageProduced.TYPE,
			AgentRunCompleted.TYPE,
		]);
	});

	it("correlates every event of the run to the same run id", async () => {
		const result = await harness.asking.handle(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		const runIds = (await harness.journalOf(result.sessionId)).map((event) => event.correlation.runId.value);
		expect(new Set(runIds).size).toBe(1);
		expect(runIds[0]).toBe(result.runId.value);
	});

	it("continues an existing session instead of starting a second one", async () => {
		const first = await harness.asking.handle(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		const second = await harness.asking.handle(new AgentRunCommand(SUPPORT, AskInput.of("again", first.sessionId)));

		expect(second.sessionId.value).toBe(first.sessionId.value);
		const created = (await harness.journalOf(first.sessionId)).filter((event) => event.type === SessionCreated.TYPE);
		expect(created).toHaveLength(1);
	});

	it("shows the model the conversation the journal recorded", async () => {
		const first = await harness.asking.handle(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		await harness.asking.handle(new AgentRunCommand(SUPPORT, AskInput.of("again", first.sessionId)));

		const said = (await harness.journalOf(first.sessionId))
			.filter((event): event is UserMessageReceived => event instanceof UserMessageReceived)
			.map((event) => event.text);
		expect(said).toEqual(["hi", "again"]);
	});

	it("records what the provider reported, so the next turn has a size to work from", async () => {
		const measured = new NativeStackFixture(
			new ScriptedModel("primary", [
				ModelChunk.text("hello"),
				ModelChunk.usage(ModelUsage.of(120, 10)),
				ModelChunk.finish("stop"),
			]),
		);

		const result = await measured.asking.handle(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		const answer = (await measured.journalOf(result.sessionId)).find(
			(event): event is AssistantMessageProduced => event instanceof AssistantMessageProduced,
		);
		expect(answer?.measurement?.usage.inputTokens).toBe(120);
		expect(answer?.measurement?.characters).toBeGreaterThan(0);
	});

	it("records no measurement when the provider reported nothing", async () => {
		const result = await harness.asking.handle(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		const answer = (await harness.journalOf(result.sessionId)).find(
			(event): event is AssistantMessageProduced => event instanceof AssistantMessageProduced,
		);
		expect(answer?.measurement).toBeUndefined();
	});

	it("records the reroutes the failover took, before the answer they led to", async () => {
		const primary = new ScriptedModel("primary", [], true);
		const fallback = new ScriptedModel("fallback");
		const rerouted = new NativeStackFixture(
			primary,
			NativeStackFixture.definitionOf(primary, new SequentialFailoverPolicy([fallback])),
		);

		const result = await rerouted.asking.handle(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		const journal = await rerouted.journalOf(result.sessionId);
		const at = journal.findIndex((event) => event instanceof ModelRerouted);
		const reroute = journal[at];
		expect(reroute).toBeInstanceOf(ModelRerouted);
		if (!(reroute instanceof ModelRerouted)) return;
		expect(reroute.from.toString()).toBe("acme/primary");
		expect(reroute.to.toString()).toBe("acme/fallback");
		expect(at).toBeLessThan(journal.findIndex((event) => event instanceof AssistantMessageProduced));
	});

	it("records the failure and rethrows it when the model gives up", async () => {
		const failing = new NativeStackFixture(new ScriptedModel("primary", [], true));

		const error = await failing.asking.handle(new AgentRunCommand(SUPPORT, AskInput.of("hi"))).catch((reason) => reason);

		expect(error).toBeInstanceOf(Error);
		const sessions = await failing.storage.find(SessionId.from("id-1"));
		expect(sessions).toBeDefined();
		const failed = (await failing.journalOf(SessionId.from("id-1"))).find(
			(event): event is AgentRunFailed => event instanceof AgentRunFailed,
		);
		expect(failed?.errorCode).toBe("AGENT_MODELS_EXHAUSTED");
	});

	it("leaves no run active, however the command settled", async () => {
		await harness.asking.handle(new AgentRunCommand(SUPPORT, AskInput.of("hi")));
		expect(harness.tracker.isEmpty).toBe(true);

		const failing = new NativeStackFixture(new ScriptedModel("primary", [], true));
		await failing.asking.handle(new AgentRunCommand(SUPPORT, AskInput.of("hi"))).catch(() => undefined);

		expect(failing.tracker.isEmpty).toBe(true);
	});

	it("refuses a session that no longer accepts commands", async () => {
		const first = await harness.asking.handle(new AgentRunCommand(SUPPORT, AskInput.of("hi")));
		const stored = await harness.storage.findOrFail(first.sessionId);
		await harness.storage.delete(first.sessionId);
		await harness.storage.create(stored.withStatus(SessionStatus.CLOSED));

		const error = await harness.asking
			.handle(new AgentRunCommand(SUPPORT, AskInput.of("again", first.sessionId)))
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(SessionClosedError);
	});

	it("refuses an agent the catalog does not know", async () => {
		const error = await harness.asking
			.handle(new AgentRunCommand(AgentName.from("billing"), AskInput.of("hi")))
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(Error);
		expect(harness.tracker.isEmpty).toBe(true);
	});
});
