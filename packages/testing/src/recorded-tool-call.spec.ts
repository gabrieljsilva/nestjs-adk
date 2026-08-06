import { describe, expect, it } from "vitest";
import { RecordedToolCall } from "./recorded-tool-call";

const CALL = RecordedToolCall.requested("c-1", "issue_refund", { orderId: "A-1042" });

describe("RecordedToolCall", () => {
	it("starts as a call nobody has answered yet", () => {
		expect(CALL.outcome).toBe("pending");
		expect(CALL.hasRun).toBe(false);
		expect(CALL.args).toEqual({ orderId: "A-1042" });
	});

	it("becomes what the tool answered", () => {
		const settled = CALL.settledWith({ refunded: true }, false);

		expect(settled.outcome).toBe("succeeded");
		expect(settled.hasRun).toBe(true);
		expect(settled.output).toEqual({ refunded: true });
	});

	it("says the tool failed rather than that it never ran", () => {
		const failed = CALL.settledWith({ error: "gateway down" }, true);

		expect(failed.outcome).toBe("failed");
		expect(failed.hasRun).toBe(true);
	});

	it("carries the reason a human gave for refusing", () => {
		const denied = CALL.deniedBecause("fora da janela de sete dias");

		expect(denied.outcome).toBe("denied");
		expect(denied.deniedReason).toBe("fora da janela de sete dias");
		expect(denied.hasRun).toBe(false);
	});

	/** A refusal travels back to the model as a result, and a refused call is still refused. */
	it("stays refused when the refusal comes back as a result", () => {
		const answered = CALL.deniedBecause("não").settledWith({ denied: true }, false);

		expect(answered.outcome).toBe("denied");
		expect(answered.deniedReason).toBe("não");
	});

	it("keeps the identity of the call through every step", () => {
		expect(CALL.settledWith({}, false).callId).toBe("c-1");
		expect(CALL.deniedBecause("x").tool).toBe("issue_refund");
	});
});
