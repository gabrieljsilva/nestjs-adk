import { describe, expect, it } from "vitest";
import { ContentDigest } from "../../../../common/digest/content-digest.value-object";
import { AgentRunId } from "../../../../common/identity/agent-run-id.value-object";
import { SessionId } from "../../../../common/identity/session-id.value-object";
import { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import { SessionRevision } from "../../../../common/revision/session-revision.value-object";
import { AgentName } from "../../../../domain/agent/agent-name.value-object";
import { ModelIdentity } from "../../../../domain/model/descriptor/model-identity.value-object";
import { ModelUsage } from "../../../../domain/model/usage/model-usage.value-object";
import { PromptMeasurement } from "../../../../domain/model/usage/prompt-measurement.value-object";
import { PendingCall } from "../../../../domain/session/approval/pending-call.value-object";
import { PendingTurn } from "../../../../domain/session/approval/pending-turn.value-object";
import { SessionSnapshot } from "../../../../domain/session/state/session-snapshot.value-object";
import { SessionState } from "../../../../domain/session/state/session-state.value-object";
import { StateValues } from "../../../../domain/session/state/state-values.value-object";
import { SnapshotCodec } from "./snapshot.codec";

const DIGEST = ContentDigest.of("sha-256", "abc123");

function stateOf(): SessionState {
	return SessionState.restored(
		SessionRevision.of(9),
		StateValues.of([["plan", "gold"]]),
		AgentName.from("billing"),
		PromptMeasurement.from(ModelUsage.of(1200, 40), 4800, ModelIdentity.of("acme", "primary")),
		PendingTurn.of(AgentRunId.from("run-1"), [
			new PendingCall(ToolCallId.from("c-1"), "issue_refund", { orderId: "A-1" }, "destructive"),
		]),
	);
}

function snapshotOf(): SessionSnapshot {
	return new SessionSnapshot(SessionId.from("s-1"), SessionRevision.of(9), 4, stateOf(), DIGEST);
}

/**
 * A snapshot is disposable, so the only thing that matters is that what comes back means
 * what went in. Anything else and the checksum refuses it and the journal is replayed,
 * which costs time and is never wrong.
 */
describe("SnapshotCodec", () => {
	it("encodes a snapshot as the columns its table is made of", () => {
		const record = new SnapshotCodec().encode(snapshotOf());

		expect(record.sessionId).toBe("s-1");
		expect(record.revision).toBe(9);
		expect(record.projectorVersion).toBe(4);
		expect(record.checksumAlgorithm).toBe("sha-256");
		expect(record.checksumValue).toBe("abc123");
	});

	it("brings back a snapshot that means the same thing", () => {
		const codec = new SnapshotCodec();
		const snapshot = snapshotOf();

		expect(codec.decode(codec.encode(snapshot))).toEqual(snapshot);
	});

	/** Without the measurement a session brought back from storage has no size at all. */
	it("keeps the size of the last prompt and the model that measured it", () => {
		const codec = new SnapshotCodec();

		const decoded = codec.decode(codec.encode(snapshotOf()));

		expect(decoded.state.lastPrompt?.usage.inputTokens).toBe(1200);
		expect(decoded.state.lastPrompt?.model?.toString()).toBe(ModelIdentity.of("acme", "primary").toString());
	});

	/** A turn that lost its held calls is a session nobody can approve anything on. */
	it("keeps the turn a session is waiting on a human for", () => {
		const codec = new SnapshotCodec();

		const decoded = codec.decode(codec.encode(snapshotOf()));

		expect(decoded.state.pendingTurn?.runId.value).toBe("run-1");
		expect(decoded.state.pendingTurn?.awaiting).toHaveLength(1);
	});

	it("decodes a plain row an adapter read out of its own table", () => {
		const codec = new SnapshotCodec();
		const record = codec.encode(snapshotOf());

		const decoded = codec.decode({ ...record, state: JSON.stringify(record.state) });

		expect(decoded).toEqual(snapshotOf());
	});
});
