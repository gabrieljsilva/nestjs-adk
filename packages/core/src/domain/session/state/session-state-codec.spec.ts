import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../../common/identity/agent-run-id";
import { ToolCallId } from "../../../common/identity/tool-call-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { AgentName } from "../../agent/agent-name";
import { ModelIdentity } from "../../model/descriptor/model-identity";
import { ModelUsage } from "../../model/usage/model-usage";
import { PromptMeasurement } from "../../model/usage/prompt-measurement";
import { PendingCall } from "../approval/pending-call";
import { PendingTurn } from "../approval/pending-turn";
import { MetadataKey } from "../metadata/metadata-key";
import { SessionMetadata } from "../metadata/session-metadata";
import { SessionState } from "./session-state";
import { SessionStateCodec } from "./session-state-codec";
import { StateValues } from "./state-values";

const codec = new SessionStateCodec();

function roundTrip(state: SessionState): SessionState {
	return codec.decode(JSON.parse(JSON.stringify(codec.encode(state))));
}

describe("SessionStateCodec", () => {
	it("brings back an empty state as an empty state", () => {
		const restored = roundTrip(SessionState.initial());

		expect(restored.revision.value).toBe(0);
		expect(restored.values.size).toBe(0);
		expect(restored.activeAgent).toBeUndefined();
		expect(restored.pendingTurn).toBeUndefined();
	});

	it("keeps the values a session carries between runs", () => {
		const state = SessionState.restored(SessionRevision.of(7), StateValues.of([["tier", "gold"]]));

		const restored = roundTrip(state);

		expect(restored.revision.value).toBe(7);
		expect(restored.values.get("tier")).toBe("gold");
	});

	it("keeps who is answering", () => {
		const state = SessionState.restored(SessionRevision.of(1), StateValues.empty(), AgentName.from("billing"));

		expect(roundTrip(state).activeAgent?.value).toBe("billing");
	});

	it("keeps the size of the last prompt, including which model reported it", () => {
		const measurement = PromptMeasurement.from(ModelUsage.of(100, 10, 40), 800, ModelIdentity.of("acme", "primary"));
		const state = SessionState.restored(SessionRevision.of(1), StateValues.empty(), undefined, measurement);

		const restored = roundTrip(state);

		expect(restored.lastPrompt?.characters).toBe(800);
		expect(restored.lastPrompt?.usage.inputTokens).toBe(100);
		expect(restored.lastPrompt?.usage.cachedInputTokens).toBe(40);
		expect(restored.lastPrompt?.model?.toString()).toBe("acme/primary");
	});

	it("remembers that nobody reported caching, rather than restoring a zero", () => {
		const measurement = PromptMeasurement.from(ModelUsage.of(100, 10), 800, ModelIdentity.of("acme", "primary"));
		const state = SessionState.restored(SessionRevision.of(1), StateValues.empty(), undefined, measurement);

		expect(roundTrip(state).lastPrompt?.usage.reportsCaching).toBe(false);
	});

	it("keeps a suspended turn, with what each call is still waiting for", () => {
		const turn = PendingTurn.of(AgentRunId.from("r-1"), [
			new PendingCall(ToolCallId.from("c-1"), "lookup_order", { orderId: "42" }),
			new PendingCall(ToolCallId.from("c-2"), "refund_order", { orderId: "42" }, "write"),
			new PendingCall(ToolCallId.from("c-3"), "close_order", {}, "write", "denied", "not authorized"),
		]);
		const state = SessionState.initial().awaiting(turn);

		const restored = roundTrip(state);

		expect(restored.isAwaitingApproval).toBe(true);
		expect(restored.pendingTurn?.runId.value).toBe("r-1");
		expect(restored.pendingTurn?.calls).toHaveLength(3);
		expect(restored.pendingTurn?.awaiting.map((call) => call.toolName)).toEqual(["refund_order"]);
		expect(restored.pendingTurn?.calls[2]?.reason).toBe("not authorized");
		expect(restored.pendingTurn?.calls[0]?.args).toEqual({ orderId: "42" });
	});

	it("survives a payload written by something that knew less", () => {
		const restored = codec.decode({ revision: 2 });

		expect(restored.revision.value).toBe(2);
		expect(restored.values.size).toBe(0);
		expect(restored.pendingTurn).toBeUndefined();
	});

	it("carries the metadata a session holds, so a snapshot means what the journal means", () => {
		const restored = roundTrip(
			SessionState.initial().withMetadata(SessionMetadata.fromRecord({ memberId: "ana", seats: 3 })),
		);

		expect(restored.metadata.find(MetadataKey.fromName("memberId"))).toBe("ana");
		expect(restored.metadata.size).toBe(2);
	});

	/** A snapshot is a shortcut, so an entry it cannot hold costs a replay and never a refusal. */
	it("drops an entry no session could have written, rather than refusing the snapshot", () => {
		const restored = codec.decode({ revision: 2, metadata: [["memberId", "ana"], ["broken", undefined], "nonsense"] });

		expect(restored.metadata.size).toBe(1);
		expect(restored.metadata.has("memberId")).toBe(true);
	});

	it("answers no metadata for a payload written before a session carried any", () => {
		expect(codec.decode({ revision: 2 }).metadata.isEmpty).toBe(true);
	});
});
