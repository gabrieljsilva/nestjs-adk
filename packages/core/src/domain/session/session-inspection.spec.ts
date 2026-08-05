import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { Instant } from "../../common/time/instant";
import { AgentName } from "../agent/agent-name";
import { ModelIdentity } from "../model/model-identity";
import { ModelUsage } from "../model/model-usage";
import { PromptMeasurement } from "../model/prompt-measurement";
import { PendingCall } from "./pending-call";
import { PendingTurn } from "./pending-turn";
import { Session } from "./session";
import { SessionInspection } from "./session-inspection";
import { SessionMode } from "./session-mode";
import { SessionState } from "./session-state";
import { SessionStatus } from "./session-status";
import { StateValues } from "./state-values";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SESSION = SessionId.from("s-1");
const SUPPORT = AgentName.from("support");
const BILLING = AgentName.from("billing");
const REFUND = ToolCallId.from("c-1");

function sessionOf(status: SessionStatus = SessionStatus.ACTIVE): Session {
	return Session.restore(SESSION, SUPPORT, SessionMode.EPHEMERAL, status, SessionRevision.of(7), NOW, NOW);
}

function suspendedTurn(): PendingTurn {
	return PendingTurn.of(AgentRunId.from("run-1"), [new PendingCall(REFUND, "refund_order", { orderId: "42" }, "write")]);
}

describe("SessionInspection", () => {
	it("answers where the conversation stands without anyone projecting a journal", () => {
		const inspection = SessionInspection.of(sessionOf(), SessionState.initial());

		expect(inspection.id.value).toBe(SESSION.value);
		expect(inspection.revision.value).toBe(7);
		expect(inspection.acceptsCommands).toBe(true);
	});

	it("falls back to the agent that roots the session when none took over", () => {
		expect(SessionInspection.of(sessionOf(), SessionState.initial()).activeAgent.value).toBe(SUPPORT.value);
	});

	it("names the agent that is answering now, once one took over", () => {
		const state = SessionState.initial().withActiveAgent(BILLING);

		expect(SessionInspection.of(sessionOf(), state).activeAgent.value).toBe(BILLING.value);
	});

	it("says nobody is waiting on a session that never suspended", () => {
		const inspection = SessionInspection.of(sessionOf(), SessionState.initial());

		expect(inspection.isAwaitingApproval).toBe(false);
		expect(inspection.approval.awaiting).toEqual([]);
	});

	it("hands over the calls a human has to decide, with everything needed to decide them", () => {
		const inspection = SessionInspection.of(sessionOf(), SessionState.initial().awaiting(suspendedTurn()));

		expect(inspection.isAwaitingApproval).toBe(true);
		const held = inspection.approval.awaiting[0];
		expect(held?.callId.value).toBe(REFUND.value);
		expect(held?.toolName).toBe("refund_order");
		expect(held?.args).toEqual({ orderId: "42" });
	});

	it("carries the size of the last prompt, which is what a cost answer starts from", () => {
		const measurement = PromptMeasurement.from(ModelUsage.of(120, 10), 480, ModelIdentity.of("acme", "primary"));
		const state = measurement === undefined ? SessionState.initial() : SessionState.initial().withLastPrompt(measurement);

		expect(SessionInspection.of(sessionOf(), state).lastPrompt?.usage.inputTokens).toBe(120);
	});

	it("carries the values the session kept between runs", () => {
		const state = SessionState.initial().withValues(StateValues.of([["tier", "gold"]]));

		expect(SessionInspection.of(sessionOf(), state).values.get("tier")).toBe("gold");
	});

	it("says a closed session takes no more commands", () => {
		expect(SessionInspection.of(sessionOf(SessionStatus.CLOSED), SessionState.initial()).acceptsCommands).toBe(false);
	});
});
