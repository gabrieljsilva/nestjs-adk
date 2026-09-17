import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { Instant } from "../../common/time/instant.value-object";
import { AgentName } from "../agent/agent-name.value-object";
import { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import { ModelUsage } from "../model/usage/model-usage.value-object";
import { PromptMeasurement } from "../model/usage/prompt-measurement.value-object";
import { PendingCall } from "./approval/pending-call.value-object";
import { PendingTurn } from "./approval/pending-turn.value-object";
import { MetadataKey } from "./metadata/metadata-key.value-object";
import { SessionMetadata } from "./metadata/session-metadata.value-object";
import { SessionInspection } from "./session-inspection.value-object";
import { SessionStatus } from "./session-status.value-object";
import { Session } from "./session.entity";
import { SessionState } from "./state/session-state.value-object";
import { StateValues } from "./state/state-values.value-object";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SESSION = SessionId.from("s-1");
const SUPPORT = AgentName.from("support");
const BILLING = AgentName.from("billing");
const REFUND = ToolCallId.from("c-1");

function sessionOf(status: SessionStatus = SessionStatus.ACTIVE): Session {
	return Session.restore(SESSION, SUPPORT, status, new SessionRevision(7), NOW, NOW);
}

function suspendedTurn(): PendingTurn {
	return new PendingTurn(AgentRunId.from("run-1"), [
		new PendingCall(REFUND, "refund_order", { orderId: "42" }, "write"),
	]);
}

describe("SessionInspection", () => {
	it("answers where the conversation stands without anyone projecting a journal", () => {
		const inspection = SessionInspection.fromSession(sessionOf(), SessionState.initial());

		expect(inspection.id.value).toBe(SESSION.value);
		expect(inspection.revision.value).toBe(7);
		expect(inspection.acceptsCommands).toBe(true);
	});

	it("falls back to the agent that roots the session when none took over", () => {
		expect(SessionInspection.fromSession(sessionOf(), SessionState.initial()).activeAgent.value).toBe(SUPPORT.value);
	});

	it("names the agent that is answering now, once one took over", () => {
		const state = SessionState.initial().withActiveAgent(BILLING);

		expect(SessionInspection.fromSession(sessionOf(), state).activeAgent.value).toBe(BILLING.value);
	});

	it("says nobody is waiting on a session that never suspended", () => {
		const inspection = SessionInspection.fromSession(sessionOf(), SessionState.initial());

		expect(inspection.isAwaitingApproval).toBe(false);
		expect(inspection.approval.awaiting).toEqual([]);
	});

	it("hands over the calls a human has to decide, with everything needed to decide them", () => {
		const inspection = SessionInspection.fromSession(sessionOf(), SessionState.initial().awaiting(suspendedTurn()));

		expect(inspection.isAwaitingApproval).toBe(true);
		const held = inspection.approval.awaiting[0];
		expect(held?.callId.value).toBe(REFUND.value);
		expect(held?.toolName).toBe("refund_order");
		expect(held?.args).toEqual({ orderId: "42" });
	});

	it("carries the size of the last prompt, which is what a cost answer starts from", () => {
		const measurement = PromptMeasurement.from(ModelUsage.fromReport(120, 10), 480, new ModelIdentity("acme", "primary"));
		const state = measurement === undefined ? SessionState.initial() : SessionState.initial().withLastPrompt(measurement);

		expect(SessionInspection.fromSession(sessionOf(), state).lastPrompt?.usage.inputTokens).toBe(120);
	});

	it("carries the values the session kept between runs", () => {
		const state = SessionState.initial().withValues(StateValues.fromEntries([["tier", "gold"]]));

		expect(SessionInspection.fromSession(sessionOf(), state).values.find("tier")).toBe("gold");
	});

	it("says a closed session takes no more commands", () => {
		expect(SessionInspection.fromSession(sessionOf(SessionStatus.CLOSED), SessionState.initial()).acceptsCommands).toBe(
			false,
		);
	});

	it("carries the metadata the application wrote on the session", () => {
		const state = SessionState.initial().withMetadata(SessionMetadata.fromRecord({ memberId: "ana" }));

		expect(SessionInspection.fromSession(sessionOf(), state).metadata.find(MetadataKey.fromName("memberId"))).toBe("ana");
	});
});
