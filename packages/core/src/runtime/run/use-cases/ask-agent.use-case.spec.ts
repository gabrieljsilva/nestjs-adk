import { beforeEach, describe, expect, it } from "vitest";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { AgentName } from "../../../domain/agent/agent-name.value-object";
import { SequentialFailoverPolicy } from "../../../domain/agent/sequential-failover.policy";
import { AgentRunCompleted } from "../../../domain/event/catalog/run/agent-run-completed.event";
import { AgentRunFailed } from "../../../domain/event/catalog/run/agent-run-failed.event";
import { AgentRunStarted } from "../../../domain/event/catalog/run/agent-run-started.event";
import { ModelRerouted } from "../../../domain/event/catalog/run/model-rerouted.event";
import { AssistantMessageProduced } from "../../../domain/event/catalog/session/assistant-message-produced.event";
import { SessionCreated } from "../../../domain/event/catalog/session/session-created.event";
import { UserMessageReceived } from "../../../domain/event/catalog/session/user-message-received.event";
import { ModelChunk } from "../../../domain/model/streaming/model-chunk.value-object";
import { ModelUsage } from "../../../domain/model/usage/model-usage.value-object";
import { SessionContext } from "../../../domain/run/session-context.value-object";
import { SessionClosedError } from "../../../domain/session/errors/session-closed.error";
import { AskInput } from "../../../domain/session/input/ask-input.command";
import { AgentRunStatus } from "../../../domain/session/run/agent-run-status.value-object";
import { SessionStatus } from "../../../domain/session/session-status.value-object";
import { NativeStackFixture } from "../../../support/run/native-stack.fixture";
import { ScriptedModel } from "../../../support/run/scripted-model.fixture";
import { AgentRunCommand } from "../agent-run.command";

const SUPPORT = NativeStackFixture.AGENT;

let harness: NativeStackFixture;

beforeEach(() => {
	harness = new NativeStackFixture(new ScriptedModel("primary"));
});

describe("AskAgentUseCase", () => {
	it("answers with the text the model produced, on a session it created", async () => {
		const result = await harness.asking.execute(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi"),
			}),
		);

		expect(result.text).toBe("hello");
		expect(result.status.equals(AgentRunStatus.COMPLETED)).toBe(true);
		expect(await harness.storage.find(SessionContext.fromSessionId(result.sessionId))).toBeDefined();
	});

	it("journals the question before the answer, and the answer with the end of the run", async () => {
		const result = await harness.asking.execute(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi"),
			}),
		);

		const types = (await harness.readJournal(result.sessionId)).map((event) => event.type);
		expect(types).toEqual([
			SessionCreated.TYPE,
			UserMessageReceived.TYPE,
			AgentRunStarted.TYPE,
			AssistantMessageProduced.TYPE,
			AgentRunCompleted.TYPE,
		]);
	});

	it("correlates every event of the run to the same run id", async () => {
		const result = await harness.asking.execute(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi"),
			}),
		);

		const runIds = (await harness.readJournal(result.sessionId)).map((event) => event.correlation.runId.value);
		expect(new Set(runIds).size).toBe(1);
		expect(runIds[0]).toBe(result.runId.value);
	});

	it("continues an existing session instead of starting a second one", async () => {
		const first = await harness.asking.execute(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi"),
			}),
		);

		const second = await harness.asking.execute(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("again", first.sessionId),
			}),
		);

		expect(second.sessionId.value).toBe(first.sessionId.value);
		const created = (await harness.readJournal(first.sessionId)).filter((event) => event.type === SessionCreated.TYPE);
		expect(created).toHaveLength(1);
	});

	it("shows the model the conversation the journal recorded", async () => {
		const first = await harness.asking.execute(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi"),
			}),
		);

		await harness.asking.execute(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("again", first.sessionId),
			}),
		);

		const said = (await harness.readJournal(first.sessionId))
			.filter((event): event is UserMessageReceived => event instanceof UserMessageReceived)
			.map((event) => event.text);
		expect(said).toEqual(["hi", "again"]);
	});

	it("records what the provider reported, so the next turn has a size to work from", async () => {
		const measured = new NativeStackFixture(
			new ScriptedModel("primary", [
				ModelChunk.text("hello"),
				ModelChunk.usage(ModelUsage.fromReport(120, 10)),
				ModelChunk.finish("stop"),
			]),
		);

		const result = await measured.asking.execute(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi"),
			}),
		);

		const answer = (await measured.readJournal(result.sessionId)).find(
			(event): event is AssistantMessageProduced => event instanceof AssistantMessageProduced,
		);
		expect(answer?.measurement?.usage.inputTokens).toBe(120);
		expect(answer?.measurement?.characters).toBeGreaterThan(0);
	});

	it("records no measurement when the provider reported nothing", async () => {
		const result = await harness.asking.execute(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi"),
			}),
		);

		const answer = (await harness.readJournal(result.sessionId)).find(
			(event): event is AssistantMessageProduced => event instanceof AssistantMessageProduced,
		);
		expect(answer?.measurement).toBeUndefined();
	});

	it("records the reroutes the failover took, before the answer they led to", async () => {
		const primary = new ScriptedModel("primary", [], true);
		const fallback = new ScriptedModel("fallback");
		const rerouted = new NativeStackFixture(
			primary,
			NativeStackFixture.buildDefinition(primary, new SequentialFailoverPolicy([fallback])),
		);

		const result = await rerouted.asking.execute(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi"),
			}),
		);

		const journal = await rerouted.readJournal(result.sessionId);
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

		const error = await failing.asking
			.execute(
				new AgentRunCommand({
					agent: SUPPORT,
					input: AskInput.fromMessage("hi"),
				}),
			)
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(Error);
		const sessions = await failing.storage.find(SessionContext.fromSessionId(SessionId.from("id-1")));
		expect(sessions).toBeDefined();
		const failed = (await failing.readJournal(SessionId.from("id-1"))).find(
			(event): event is AgentRunFailed => event instanceof AgentRunFailed,
		);
		expect(failed?.errorCode).toBe("AGENT_MODELS_EXHAUSTED");
	});

	it("leaves no run active, however the command settled", async () => {
		await harness.asking.execute(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi"),
			}),
		);
		expect(harness.tracker.isEmpty).toBe(true);

		const failing = new NativeStackFixture(new ScriptedModel("primary", [], true));
		await failing.asking
			.execute(
				new AgentRunCommand({
					agent: SUPPORT,
					input: AskInput.fromMessage("hi"),
				}),
			)
			.catch(() => undefined);

		expect(failing.tracker.isEmpty).toBe(true);
	});

	it("refuses a session that no longer accepts commands", async () => {
		const first = await harness.asking.execute(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi"),
			}),
		);
		const stored = await harness.storage.findOrFail(SessionContext.fromSessionId(first.sessionId));
		await harness.storage.delete(SessionContext.fromSessionId(first.sessionId));
		await harness.storage.create(SessionContext.fromSessionId(first.sessionId), stored.withStatus(SessionStatus.CLOSED));

		const error = await harness.asking
			.execute(
				new AgentRunCommand({
					agent: SUPPORT,
					input: AskInput.fromMessage("again", first.sessionId),
				}),
			)
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(SessionClosedError);
	});

	it("refuses an agent the catalog does not know", async () => {
		const error = await harness.asking
			.execute(
				new AgentRunCommand({
					agent: AgentName.from("billing"),
					input: AskInput.fromMessage("hi"),
				}),
			)
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(Error);
		expect(harness.tracker.isEmpty).toBe(true);
	});
});
