import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { ApprovalStatus } from "./approval-status";
import { PendingCall } from "./pending-call";
import { PendingTurn } from "./pending-turn";

const RUN = AgentRunId.from("run-1");
const LOOKUP = ToolCallId.from("c-1");
const REFUND = ToolCallId.from("c-2");
const CLOSE = ToolCallId.from("c-3");

function turnOf(): PendingTurn {
	return PendingTurn.of(RUN, [
		new PendingCall(LOOKUP, "lookup_order", {}),
		new PendingCall(REFUND, "refund_order", { orderId: "42" }, "write"),
		new PendingCall(CLOSE, "close_order", {}, "write"),
	]);
}

describe("ApprovalStatus", () => {
	it("answers that nobody is waiting when no turn was ever held", () => {
		const none = ApprovalStatus.none();

		expect(none.isAwaiting).toBe(false);
		expect(none.awaiting).toEqual([]);
		expect(none.runId).toBeUndefined();
	});

	it("lists only the calls somebody still has to answer for", () => {
		const status = ApprovalStatus.of(turnOf());

		expect(status.awaiting.map((call) => call.toolName)).toEqual(["refund_order", "close_order"]);
		expect(status.isAwaiting).toBe(true);
	});

	it("carries the arguments and the effect, which is what an approval screen shows", () => {
		const held = ApprovalStatus.of(turnOf()).awaiting[0];

		expect(held?.args).toEqual({ orderId: "42" });
		expect(held?.effect).toBe("write");
	});

	it("keeps what was already decided, so a half answered turn can be shown whole", () => {
		const status = ApprovalStatus.of(turnOf().decided(REFUND, "granted"));

		expect(status.awaiting.map((call) => call.toolName)).toEqual(["close_order"]);
		expect(status.decided.map((call) => call.toolName)).toEqual(["refund_order"]);
		expect(status.held).toHaveLength(2);
	});

	it("stops awaiting once every held call has an answer", () => {
		const status = ApprovalStatus.of(turnOf().decided(REFUND, "granted").decided(CLOSE, "denied", "too late"));

		expect(status.isAwaiting).toBe(false);
		expect(status.decided).toHaveLength(2);
	});

	it("points back at the run that was suspended", () => {
		expect(ApprovalStatus.of(turnOf()).runId?.value).toBe(RUN.value);
	});
});
