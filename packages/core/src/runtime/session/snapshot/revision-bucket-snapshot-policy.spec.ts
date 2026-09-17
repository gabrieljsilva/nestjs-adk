import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../../common/identity/agent-run-id";
import { ToolCallId } from "../../../common/identity/tool-call-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { PendingCall } from "../../../domain/session/approval/pending-call";
import { PendingTurn } from "../../../domain/session/approval/pending-turn";
import { SessionState } from "../../../domain/session/state/session-state";
import { RevisionBucketSnapshotPolicy } from "./revision-bucket-snapshot-policy";
import { SnapshotPolicy } from "./snapshot-policy";

const running = SessionState.initial();

function awaitingApproval(): SessionState {
	const call = new PendingCall(ToolCallId.from("call-1"), "wire_money", { amount: 1 }, "write");
	return SessionState.initial().awaiting(PendingTurn.of(AgentRunId.from("run-1"), [call]));
}

describe("RevisionBucketSnapshotPolicy", () => {
	it("waits for the full threshold before the first snapshot", () => {
		const policy = RevisionBucketSnapshotPolicy.everyFiftyEvents();

		expect(policy.shouldSnapshot(SessionRevision.of(48), SessionRevision.of(49), running)).toBe(false);
		expect(policy.shouldSnapshot(SessionRevision.of(49), SessionRevision.of(50), running)).toBe(true);
	});

	it("counts from where the last threshold fell, not from the previous commit", () => {
		const policy = RevisionBucketSnapshotPolicy.everyFiftyEvents();

		expect(policy.shouldSnapshot(SessionRevision.of(51), SessionRevision.of(60), running)).toBe(false);
		expect(policy.shouldSnapshot(SessionRevision.of(99), SessionRevision.of(100), running)).toBe(true);
	});

	it("takes a batch that jumps over the threshold in one commit", () => {
		const policy = RevisionBucketSnapshotPolicy.everyFiftyEvents();

		expect(policy.shouldSnapshot(SessionRevision.of(40), SessionRevision.of(70), running)).toBe(true);
	});

	it("always snapshots a turn waiting for approval, whatever the distance", () => {
		const policy = RevisionBucketSnapshotPolicy.everyFiftyEvents();

		expect(policy.shouldSnapshot(SessionRevision.initial(), SessionRevision.of(1), awaitingApproval())).toBe(true);
	});

	it("accepts a configured threshold", () => {
		const policy = RevisionBucketSnapshotPolicy.every(3);

		expect(policy.shouldSnapshot(SessionRevision.of(1), SessionRevision.of(2), running)).toBe(false);
		expect(policy.shouldSnapshot(SessionRevision.of(2), SessionRevision.of(3), running)).toBe(true);
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
