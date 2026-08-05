import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { PendingCall } from "./pending-call";

const CALL = ToolCallId.from("c-1");
const OTHER = ToolCallId.from("c-2");

function heldCall(): PendingCall {
	return new PendingCall(CALL, "refund_order", { orderId: "42" }, "write");
}

describe("PendingCall", () => {
	it("is held only when a policy gave it an effect to answer for", () => {
		expect(heldCall().isHeld).toBe(true);
		expect(new PendingCall(CALL, "lookup_order", {}).isHeld).toBe(false);
	});

	it("keeps the arguments, so the call that runs later is the call that was shown", () => {
		expect(heldCall().args).toEqual({ orderId: "42" });
	});

	it("waits while it is held and nobody has answered", () => {
		expect(heldCall().isAwaiting).toBe(true);
		expect(heldCall().decidedAs("granted").isAwaiting).toBe(false);
	});

	it("never waits when nobody had to answer for it", () => {
		expect(new PendingCall(CALL, "lookup_order", {}).isAwaiting).toBe(false);
	});

	it("carries the reason it was refused, which is what the model gets told", () => {
		const denied = heldCall().decidedAs("denied", "not authorized");

		expect(denied.isDenied).toBe(true);
		expect(denied.reason).toBe("not authorized");
	});

	it("answers only for its own call", () => {
		expect(heldCall().isFor(CALL)).toBe(true);
		expect(heldCall().isFor(OTHER)).toBe(false);
	});

	it("leaves the call it was built from untouched when it is decided", () => {
		const call = heldCall();

		call.decidedAs("granted");

		expect(call.isDecided).toBe(false);
	});
});
