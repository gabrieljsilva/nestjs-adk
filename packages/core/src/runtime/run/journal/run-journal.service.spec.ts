import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../../common/identity/artifact-id.value-object";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { Instant } from "../../../common/time/instant.value-object";
import { ArtifactContent } from "../../../domain/artifact/artifact-content.value-object";
import { ArtifactReference } from "../../../domain/artifact/artifact-reference.value-object";
import { ToolApprovalDenied } from "../../../domain/event/catalog/approval/tool-approval-denied.event";
import { ToolApprovalGranted } from "../../../domain/event/catalog/approval/tool-approval-granted.event";
import { ToolApprovalRequested } from "../../../domain/event/catalog/approval/tool-approval-requested.event";
import { SessionMetadataSet } from "../../../domain/event/catalog/metadata/session-metadata-set.event";
import { AgentRunCompleted } from "../../../domain/event/catalog/run/agent-run-completed.event";
import { AgentRunFailed } from "../../../domain/event/catalog/run/agent-run-failed.event";
import { AgentRunStarted } from "../../../domain/event/catalog/run/agent-run-started.event";
import { AgentRunSuspended } from "../../../domain/event/catalog/run/agent-run-suspended.event";
import { AssistantMessageProduced } from "../../../domain/event/catalog/session/assistant-message-produced.event";
import { SessionCreated } from "../../../domain/event/catalog/session/session-created.event";
import { UserMessageReceived } from "../../../domain/event/catalog/session/user-message-received.event";
import { ModelIdentity } from "../../../domain/model/descriptor/model-identity.value-object";
import { ModelResponse } from "../../../domain/model/model-response.value-object";
import { ModelUsage } from "../../../domain/model/usage/model-usage.value-object";
import { PendingCall } from "../../../domain/session/approval/pending-call.value-object";
import { PendingTurn } from "../../../domain/session/approval/pending-turn.value-object";
import { AskInput } from "../../../domain/session/input/ask-input.command";
import { SessionMetadata } from "../../../domain/session/metadata/session-metadata.value-object";
import { Session } from "../../../domain/session/session.entity";
import { SessionState } from "../../../domain/session/state/session-state.value-object";
import { Actor } from "../../../domain/tool/access/actor.value-object";
import { ToolSourceAuthError } from "../../../domain/tool/errors/tool-source-auth.error";
import { ToolOutcome } from "../../../domain/tool/invocation/tool-outcome.value-object";
import { FakeClock } from "../../../support/fake-clock.double";
import { NativeStackFixture } from "../../../support/run/native-stack.fixture";
import { ScriptedModel } from "../../../support/run/scripted-model.fixture";
import { SequenceIdGenerator } from "../../../support/sequence-id-generator.double";
import { ActiveRunTracker } from "../../lifecycle/active-run-tracker.service";
import { RuntimeLifecycle } from "../../lifecycle/runtime-lifecycle.service";
import { ShutdownOptions } from "../../lifecycle/shutdown.options";
import { ModelRunOutcome } from "../../model/model-run-outcome.value-object";
import { OpenedSession } from "../../session/opened-session.value-object";
import { AgentRunCommand } from "../agent-run.command";
import { AgentRunFactory } from "../agent-run.factory";
import type { StartedRun } from "../settle/started-run.value-object";
import { RunEventFactory } from "./run-event.factory";
import { RunJournal } from "./run-journal.service";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SESSION = SessionId.from("s-1");
const MODEL = new ModelIdentity("acme", "primary");
const CALL = ToolCallId.from("c-1");
const clock = new FakeClock(NOW);
const journal = new RunJournal(new RunEventFactory(new SequenceIdGenerator("e"), clock));

function startedRun(): StartedRun {
	const tracker = new ActiveRunTracker();
	const lifecycle = new RuntimeLifecycle(tracker, ShutdownOptions.waitIndefinitely(), clock);
	return new AgentRunFactory(new SequenceIdGenerator("run"), clock, tracker, lifecycle).start(
		SESSION,
		NativeStackFixture.AGENT,
	);
}

function openedSession(isNew: boolean): OpenedSession {
	const session = Session.start(SESSION, NativeStackFixture.AGENT, NOW);
	return new OpenedSession(session, SessionState.initial(), isNew);
}

function outcomeOf(response: ModelResponse): ModelRunOutcome {
	return new ModelRunOutcome(response);
}

describe("RunJournal", () => {
	it("records a session that began, the question and the run, in that order", () => {
		const batch = journal.opening(
			startedRun(),
			NativeStackFixture.AGENT,
			MODEL,
			new AgentRunCommand({
				agent: NativeStackFixture.AGENT,
				input: AskInput.fromMessage("hi"),
			}),
			openedSession(true),
		);

		expect(batch.events.map((event) => event.type)).toEqual([
			SessionCreated.TYPE,
			UserMessageReceived.TYPE,
			AgentRunStarted.TYPE,
		]);
	});

	/** Only the id: an actor's claims are read at the call, and a copy of them would outlive that. */
	it("names the actor the question was asked with, on the beginning and on the question", () => {
		const batch = journal.opening(
			startedRun(),
			NativeStackFixture.AGENT,
			MODEL,
			new AgentRunCommand({
				agent: NativeStackFixture.AGENT,
				input: AskInput.fromMessage("first", SESSION),
				sources: [],
				actor: Actor.fromId("u-1", { role: "admin" }),
			}),
			openedSession(true),
		);

		const created = batch.events[0];
		expect(created).toBeInstanceOf(SessionCreated);
		if (created instanceof SessionCreated) expect(created.actorId).toBe("u-1");

		const asked = batch.events.find((event) => event instanceof UserMessageReceived);
		expect(asked).toBeInstanceOf(UserMessageReceived);
		if (asked instanceof UserMessageReceived) expect(asked.actorId).toBe("u-1");
	});

	it("writes one event per metadata key the question carried, before the question itself", () => {
		const batch = journal.opening(
			startedRun(),
			NativeStackFixture.AGENT,
			MODEL,
			new AgentRunCommand({
				agent: NativeStackFixture.AGENT,
				input: new AskInput({
					message: "first",
					attachments: [],
					sessionId: SESSION,
					references: [],
					metadata: SessionMetadata.fromRecord({ memberId: "gabriel" }),
				}),
			}),
			openedSession(false),
		);

		expect(batch.events.map((event) => event.type)).toEqual([
			SessionMetadataSet.TYPE,
			UserMessageReceived.TYPE,
			AgentRunStarted.TYPE,
		]);
	});

	it("records no session for a conversation that already existed", () => {
		const batch = journal.opening(
			startedRun(),
			NativeStackFixture.AGENT,
			MODEL,
			new AgentRunCommand({
				agent: NativeStackFixture.AGENT,
				input: AskInput.fromMessage("again", SESSION),
			}),
			openedSession(false),
		);

		expect(batch.events.map((event) => event.type)).toEqual([UserMessageReceived.TYPE, AgentRunStarted.TYPE]);
	});

	it("ends the run in the same write as the answer, so no reader finds one without the other", () => {
		const batch = journal.turn(startedRun(), outcomeOf(new ModelResponse(MODEL, "done")), 400, true);

		expect(batch.events.map((event) => event.type)).toEqual([AssistantMessageProduced.TYPE, AgentRunCompleted.TYPE]);
	});

	it("leaves the run open when the turn asked for something else", () => {
		const batch = journal.turn(startedRun(), outcomeOf(new ModelResponse(MODEL, "")), 400, false);

		expect(batch.events.map((event) => event.type)).toEqual([AssistantMessageProduced.TYPE]);
	});

	it("keeps the measurement the provider reported, next to the size of what it measured", () => {
		const response = new ModelResponse(MODEL, "done", [], ModelUsage.fromReport(120, 10));

		const batch = journal.turn(startedRun(), outcomeOf(response), 480, true);

		const answer = batch.events[0];
		expect(answer).toBeInstanceOf(AssistantMessageProduced);
		if (!(answer instanceof AssistantMessageProduced)) return;
		expect(answer.measurement?.usage.inputTokens).toBe(120);
		expect(answer.measurement?.characters).toBe(480);
	});

	it("asks about every held call, and suspends carrying the whole turn", () => {
		const calls = [
			new PendingCall(CALL, "lookup_order", {}),
			new PendingCall(ToolCallId.from("c-2"), "refund_order", {}, "write"),
		];

		const batch = journal.suspension(startedRun(), calls);

		expect(batch.events.map((event) => event.type)).toEqual([ToolApprovalRequested.TYPE, AgentRunSuspended.TYPE]);
		const suspended = batch.events[1];
		expect(suspended).toBeInstanceOf(AgentRunSuspended);
		if (suspended instanceof AgentRunSuspended) expect(suspended.calls).toHaveLength(2);
	});

	it("says what it is still waiting on when one answer did not release the turn", () => {
		const turn = new PendingTurn(startedRun().run.id, [
			new PendingCall(CALL, "refund_order", {}, "write", "granted"),
			new PendingCall(ToolCallId.from("c-2"), "close_order", {}, "write"),
		]);

		const batch = journal.stillWaiting(startedRun(), turn);

		const suspended = batch.events[0];
		expect(suspended).toBeInstanceOf(AgentRunSuspended);
		if (suspended instanceof AgentRunSuspended) expect(suspended.reason).toContain("close_order");
	});

	it("records a decision as what it was, granted or denied with its reason", () => {
		expect(journal.decision(startedRun(), CALL, "granted", "gabriel")).toBeInstanceOf(ToolApprovalGranted);
		const denied = journal.decision(startedRun(), CALL, "denied", "gabriel", "not authorized");
		expect(denied).toBeInstanceOf(ToolApprovalDenied);
		if (denied instanceof ToolApprovalDenied) expect(denied.reason).toBe("not authorized");
	});

	it("records the placeholder and the artifact when a result was too large for the context", () => {
		const content = ArtifactContent.fromText("a very long report");
		const reference = ArtifactReference.fromContent(ArtifactId.from("a-1"), SESSION, content);
		const outcome = ToolOutcome.succeeded(CALL, "report", { rows: 1 }, reference.toString(), reference);

		const event = journal.result(startedRun(), outcome);

		expect(event.artifactId?.value).toBe("a-1");
		expect(event.output.artifactId).toBe("a-1");
	});

	it("records a refusal as a failed result that says refused, not error", () => {
		const call = new PendingCall(CALL, "refund_order", {}, "write", "denied", "not authorized");

		const event = journal.refusal(startedRun(), call);

		expect(event.failed).toBe(true);
		expect(event.output).toEqual({ refused: true, reason: "not authorized" });
	});

	it("records a refusal without a reason as refused all the same", () => {
		const call = new PendingCall(CALL, "refund_order", {}, "write", "denied");

		const event = journal.refusal(startedRun(), call);

		expect(event.output).toEqual({ refused: true, reason: "" });
	});

	it("records every source that would not authorize, one event each", () => {
		const batch = journal.reauth(startedRun(), [
			new ToolSourceAuthError("crm", "token expired"),
			new ToolSourceAuthError("billing", "token expired"),
		]);

		expect(batch.events).toHaveLength(2);
	});

	it("takes the code of a typed failure, and names the ones it cannot classify", () => {
		const failed = journal.terminal(startedRun(), new ToolSourceAuthError("crm", "token expired"));

		expect(failed).toBeInstanceOf(AgentRunFailed);
		if (failed instanceof AgentRunFailed) expect(failed.errorCode).toBe("TOOL_SOURCE_AUTH");
	});

	it("names an unexpected failure rather than leaving it without a code", () => {
		const failed = journal.terminal(startedRun(), new Error("something broke"));

		expect(failed).toBeInstanceOf(AgentRunFailed);
		if (failed instanceof AgentRunFailed) expect(failed.errorCode).toBe("UNEXPECTED_ERROR");
	});
});
