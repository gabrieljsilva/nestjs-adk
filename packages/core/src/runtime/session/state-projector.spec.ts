import { describe, expect, it } from "vitest";
import { AgentId } from "../../common/identity/agent-id";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { CorrelationId } from "../../common/identity/correlation-id";
import { EventId } from "../../common/identity/event-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { Instant } from "../../common/time/instant";
import { AgentName } from "../../domain/agent/agent-name";
import { ToolApprovalDenied } from "../../domain/event/catalog/approval/tool-approval-denied";
import { ToolApprovalGranted } from "../../domain/event/catalog/approval/tool-approval-granted";
import { SessionMetadataDeleted } from "../../domain/event/catalog/metadata/session-metadata-deleted";
import { SessionMetadataSet } from "../../domain/event/catalog/metadata/session-metadata-set";
import { AgentRunCompleted } from "../../domain/event/catalog/run/agent-run-completed";
import { AgentRunSuspended } from "../../domain/event/catalog/run/agent-run-suspended";
import { AssistantMessageProduced } from "../../domain/event/catalog/session/assistant-message-produced";
import { SessionCreated } from "../../domain/event/catalog/session/session-created";
import { UserMessageReceived } from "../../domain/event/catalog/session/user-message-received";
import { AgentTransferred } from "../../domain/event/catalog/transfer/agent-transferred";
import { EventCorrelation } from "../../domain/event/event-correlation";
import { EventHeader } from "../../domain/event/event-header";
import type { SessionEvent } from "../../domain/event/session-event";
import { StoredSessionEvent } from "../../domain/event/stored-session-event";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity";
import { ModelUsage } from "../../domain/model/usage/model-usage";
import { PromptMeasurement } from "../../domain/model/usage/prompt-measurement";
import { PendingCall } from "../../domain/session/approval/pending-call";
import { MetadataKey } from "../../domain/session/metadata/metadata-key";
import { SessionState } from "../../domain/session/state/session-state";
import { StateProjector } from "./state-projector";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const MODEL = ModelIdentity.of("acme", "primary");
const SUPPORT = AgentName.from("support");
const BILLING = AgentName.from("billing");
const projector = new StateProjector();
const LOOKUP = ToolCallId.from("c-1");
const REFUND = ToolCallId.from("c-2");
const CLOSE = ToolCallId.from("c-3");
const MEMBER = MetadataKey.fromName<string>("memberId", (value): value is string => typeof value === "string");

function suspension(): AgentRunSuspended {
	return new AgentRunSuspended(header("e-1"), "waiting", [
		new PendingCall(LOOKUP, "lookup_order", {}),
		new PendingCall(REFUND, "refund_order", { orderId: "42" }, "write"),
	]);
}

function twiceHeldSuspension(): AgentRunSuspended {
	return new AgentRunSuspended(header("e-1"), "waiting", [
		new PendingCall(REFUND, "refund_order", { orderId: "42" }, "write"),
		new PendingCall(CLOSE, "close_order", { orderId: "42" }, "write"),
	]);
}

function header(id: string): EventHeader {
	return new EventHeader(
		EventId.from(id),
		NOW,
		new EventCorrelation(AgentRunId.from("r-1"), AgentId.from("a-1"), CorrelationId.from("c-1")),
	);
}

function stored(revision: number, event: SessionEvent): StoredSessionEvent {
	return new StoredSessionEvent(SessionId.from("s-1"), SessionRevision.of(revision), event);
}

describe("StateProjector", () => {
	it("declares a version, since snapshots are tied to it", () => {
		expect(StateProjector.VERSION).toBe(5);
	});

	it("carries forward the size a provider reported for the last prompt", () => {
		const measurement = PromptMeasurement.from(ModelUsage.of(120, 10), 480);
		const answer = new AssistantMessageProduced(header("e-1"), "hello", MODEL, measurement);

		const state = projector.apply(SessionState.initial(), stored(1, answer));

		expect(state.lastPrompt?.usage.inputTokens).toBe(120);
		expect(state.lastPrompt?.characters).toBe(480);
	});

	it("keeps the previous size when a turn came back without one", () => {
		const measured = PromptMeasurement.from(ModelUsage.of(120, 10), 480);
		const first = projector.apply(
			SessionState.initial(),
			stored(1, new AssistantMessageProduced(header("e-1"), "hello", MODEL, measured)),
		);

		const second = projector.apply(first, stored(2, new AssistantMessageProduced(header("e-2"), "again", MODEL)));

		expect(second.lastPrompt?.usage.inputTokens).toBe(120);
	});

	it("advances the revision for every event", () => {
		const state = projector.apply(SessionState.initial(), stored(1, new UserMessageReceived(header("e-1"), "hi")));

		expect(state.revision.value).toBe(1);
	});

	it("adopts the root agent when the session is created", () => {
		const state = projector.apply(
			SessionState.initial(),
			stored(1, new SessionCreated(header("e-1"), SUPPORT, undefined)),
		);

		expect(state.activeAgent?.value).toBe("support");
	});

	it("switches the active agent on transfer", () => {
		const created = projector.apply(
			SessionState.initial(),
			stored(1, new SessionCreated(header("e-1"), SUPPORT, undefined)),
		);
		const transferred = projector.apply(created, stored(2, new AgentTransferred(header("e-2"), SUPPORT, BILLING)));

		expect(transferred.activeAgent?.value).toBe("billing");
	});

	it("keeps conversation text out of the state", () => {
		const state = projector.apply(
			SessionState.initial(),
			stored(1, new UserMessageReceived(header("e-1"), "my card number")),
		);

		expect(state.values.size).toBe(0);
	});

	it("never mutates the state it received", () => {
		const before = SessionState.initial();
		projector.apply(before, stored(1, new SessionCreated(header("e-1"), SUPPORT, undefined)));

		expect(before.revision.value).toBe(0);
		expect(before.activeAgent).toBeUndefined();
	});

	it("folds a whole journal and lands on the last revision", () => {
		const state = projector.applyAll(SessionState.initial(), [
			stored(1, new SessionCreated(header("e-1"), SUPPORT, undefined)),
			stored(2, new UserMessageReceived(header("e-2"), "hi")),
			stored(3, new AgentTransferred(header("e-3"), SUPPORT, BILLING)),
		]);

		expect(state.revision.value).toBe(3);
		expect(state.activeAgent?.value).toBe("billing");
	});

	it("reaches the same state when the same journal is replayed twice", () => {
		const events = [
			stored(1, new SessionCreated(header("e-1"), SUPPORT, undefined)),
			stored(2, new AgentTransferred(header("e-2"), SUPPORT, BILLING)),
		];

		const first = projector.applyAll(SessionState.initial(), events);
		const second = projector.applyAll(SessionState.initial(), events);

		expect(first.revision.value).toBe(second.revision.value);
		expect(first.activeAgent?.value).toBe(second.activeAgent?.value);
	});

	it("puts the whole suspended turn into the state, not only the call that was held", () => {
		const state = projector.apply(SessionState.initial(), stored(1, suspension()));

		expect(state.pendingTurn?.calls).toHaveLength(2);
		expect(state.pendingTurn?.held).toHaveLength(1);
		expect(state.isAwaitingApproval).toBe(true);
	});

	it("keeps the session waiting after a decision that does not release the whole turn", () => {
		const state = projector.applyAll(SessionState.initial(), [
			stored(1, twiceHeldSuspension()),
			stored(2, new ToolApprovalGranted(header("e-2"), REFUND, "gabriel")),
		]);

		expect(state.isAwaitingApproval).toBe(true);
		expect(state.pendingTurn?.isAwaiting(CLOSE)).toBe(true);
	});

	it("releases the turn once every held call has an answer", () => {
		const state = projector.applyAll(SessionState.initial(), [
			stored(1, twiceHeldSuspension()),
			stored(2, new ToolApprovalGranted(header("e-2"), REFUND, "gabriel")),
			stored(3, new ToolApprovalDenied(header("e-3"), CLOSE, "gabriel", "too late")),
		]);

		expect(state.isAwaitingApproval).toBe(false);
		expect(state.pendingTurn?.isDecided).toBe(true);
		expect(state.pendingTurn?.find(CLOSE)?.reason).toBe("too late");
	});

	it("forgets the turn once a run ended having run it, so a decision cannot arrive twice", () => {
		const state = projector.applyAll(SessionState.initial(), [
			stored(1, suspension()),
			stored(2, new ToolApprovalGranted(header("e-2"), REFUND, "gabriel")),
			stored(3, new AgentRunCompleted(header("e-3"), "stop")),
		]);

		expect(state.pendingTurn).toBeUndefined();
	});

	describe("the metadata it folds", () => {
		it("starts with none, because a session says nothing until somebody writes it", () => {
			expect(SessionState.initial().metadata.isEmpty).toBe(true);
		});

		it("keeps what a write put there", () => {
			const state = projector.applyAll(SessionState.initial(), [
				stored(1, new SessionMetadataSet(header("e-1"), "memberId", "gabriel")),
			]);

			expect(state.metadata.find(MEMBER)).toBe("gabriel");
		});

		/** Last write per key is what makes a replay and a snapshot land on the same map. */
		it("keeps the last write of a key, whatever came before it", () => {
			const state = projector.applyAll(SessionState.initial(), [
				stored(1, new SessionMetadataSet(header("e-1"), "memberId", "gabriel")),
				stored(2, new SessionMetadataSet(header("e-2"), "memberId", "ana")),
			]);

			expect(state.metadata.find(MEMBER)).toBe("ana");
		});

		it("forgets a key a deletion named, and leaves the rest where they are", () => {
			const state = projector.applyAll(SessionState.initial(), [
				stored(1, new SessionMetadataSet(header("e-1"), "memberId", "gabriel")),
				stored(2, new SessionMetadataSet(header("e-2"), "locale", "pt-BR")),
				stored(3, new SessionMetadataDeleted(header("e-3"), "memberId")),
			]);

			expect(state.metadata.has("memberId")).toBe(false);
			expect(state.metadata.has("locale")).toBe(true);
		});

		it("survives everything else the journal folds", () => {
			const state = projector.applyAll(SessionState.initial(), [
				stored(1, new SessionCreated(header("e-1"), SUPPORT, undefined)),
				stored(2, new SessionMetadataSet(header("e-2"), "memberId", "gabriel")),
				stored(3, new AgentTransferred(header("e-3"), SUPPORT, BILLING)),
				stored(4, new AgentRunCompleted(header("e-4"), "stop")),
			]);

			expect(state.metadata.find(MEMBER)).toBe("gabriel");
			expect(state.activeAgent?.value).toBe("billing");
		});
	});
});
