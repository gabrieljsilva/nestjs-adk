import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { SessionRevision } from "../../../common/revision/session-revision.value-object";
import { PendingCall } from "../../../domain/session/approval/pending-call.value-object";
import { PendingTurn } from "../../../domain/session/approval/pending-turn.value-object";
import { SessionState } from "../../../domain/session/state/session-state.value-object";
import { RevisionBucketSnapshotPolicy } from "./revision-bucket-snapshot.policy";
import { SnapshotPolicy } from "./snapshot.policy";

const running = SessionState.initial();

function awaitingApproval(): SessionState {
	const call = new PendingCall(ToolCallId.from("call-1"), "wire_money", { amount: 1 }, "write");
	return SessionState.initial().awaiting(new PendingTurn(AgentRunId.from("run-1"), [call]));
}

describe("RevisionBucketSnapshotPolicy", () => {
	it("waits for the full threshold before the first snapshot", () => {
		const policy = RevisionBucketSnapshotPolicy.everyFiftyEvents();

		expect(policy.shouldSnapshot(new SessionRevision(48), new SessionRevision(49), running)).toBe(false);
		expect(policy.shouldSnapshot(new SessionRevision(49), new SessionRevision(50), running)).toBe(true);
	});

	it("counts from where the last threshold fell, not from the previous commit", () => {
		const policy = RevisionBucketSnapshotPolicy.everyFiftyEvents();

		expect(policy.shouldSnapshot(new SessionRevision(51), new SessionRevision(60), running)).toBe(false);
		expect(policy.shouldSnapshot(new SessionRevision(99), new SessionRevision(100), running)).toBe(true);
	});

	it("takes a batch that jumps over the threshold in one commit", () => {
		const policy = RevisionBucketSnapshotPolicy.everyFiftyEvents();

		expect(policy.shouldSnapshot(new SessionRevision(40), new SessionRevision(70), running)).toBe(true);
	});

	it("always snapshots a turn waiting for approval, whatever the distance", () => {
		const policy = RevisionBucketSnapshotPolicy.everyFiftyEvents();

		expect(policy.shouldSnapshot(SessionRevision.initial(), new SessionRevision(1), awaitingApproval())).toBe(true);
	});

	it("accepts a configured threshold", () => {
		const policy = RevisionBucketSnapshotPolicy.every(3);

		expect(policy.shouldSnapshot(new SessionRevision(1), new SessionRevision(2), running)).toBe(false);
		expect(policy.shouldSnapshot(new SessionRevision(2), new SessionRevision(3), running)).toBe(true);
	});

	it("never accepts a threshold below one event", () => {
		expect(RevisionBucketSnapshotPolicy.every(0).everyEvents).toBe(1);
		expect(RevisionBucketSnapshotPolicy.every(-10).everyEvents).toBe(1);
	});

	it("exposes the default so it is never implicit", () => {
		expect(RevisionBucketSnapshotPolicy.everyFiftyEvents().everyEvents).toBe(50);
	});

	it("is the port a commit asks, so an application can answer it differently", () => {
		expect(RevisionBucketSnapshotPolicy.everyFiftyEvents()).toBeInstanceOf(SnapshotPolicy);
	});
});
