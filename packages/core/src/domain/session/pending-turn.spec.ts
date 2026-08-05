import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { PendingCall } from "./pending-call";
import { PendingTurn } from "./pending-turn";

const RUN = AgentRunId.from("run-1");
const LOOKUP = ToolCallId.from("c-1");
const REFUND = ToolCallId.from("c-2");
const CLOSE = ToolCallId.from("c-3");

function turnOf(): PendingTurn {
	return PendingTurn.of(RUN, [
		new PendingCall(LOOKUP, "lookup_order", { orderId: "42" }),
		new PendingCall(REFUND, "refund_order", { orderId: "42" }, "write"),
		new PendingCall(CLOSE, "close_order", { orderId: "42" }, "write"),
	]);
}

describe("PendingTurn", () => {
	it("keeps every call of the turn, not only the ones somebody has to answer for", () => {
		expect(turnOf().calls).toHaveLength(3);
		expect(turnOf().held).toHaveLength(2);
	});

	it("points back at the run that was suspended", () => {
		expect(turnOf().runId).toBe(RUN);
	});

	it("is not decided while one held call is still waiting", () => {
		const turn = turnOf().decided(REFUND, "granted");

		expect(turn.isDecided).toBe(false);
		expect(turn.awaiting.map((call) => call.toolName)).toEqual(["close_order"]);
	});

	it("is decided once every held call has an answer, whichever answer it was", () => {
		const turn = turnOf().decided(REFUND, "granted").decided(CLOSE, "denied", "too late");

		expect(turn.isDecided).toBe(true);
	});

	it("counts a turn nobody had to answer for as already decided", () => {
		const turn = PendingTurn.of(RUN, [new PendingCall(LOOKUP, "lookup_order", {})]);

		expect(turn.isDecided).toBe(true);
	});

	it("stops awaiting a call that was already answered, which is what refuses a repeated decision", () => {
		expect(turnOf().isAwaiting(REFUND)).toBe(true);
		expect(turnOf().decided(REFUND, "granted").isAwaiting(REFUND)).toBe(false);
	});

	it("never awaits a call that was not held, so approving one is not a way in", () => {
		expect(turnOf().isAwaiting(LOOKUP)).toBe(false);
	});

	it("leaves the other calls exactly as they were when one is decided", () => {
		const turn = turnOf().decided(REFUND, "denied", "not authorized");

		expect(turn.find(REFUND)?.reason).toBe("not authorized");
		expect(turn.find(CLOSE)?.isDecided).toBe(false);
		expect(turn.find(LOOKUP)?.toolName).toBe("lookup_order");
	});

	it("keeps the calls in the order the model asked for them", () => {
		expect(turnOf().calls.map((call) => call.toolName)).toEqual(["lookup_order", "refund_order", "close_order"]);
	});
});
