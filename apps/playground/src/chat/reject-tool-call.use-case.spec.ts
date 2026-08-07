import { describe, expect, it } from "vitest";
import { RecordingConcierge } from "./recording-concierge.fixture";
import { RejectToolCallUseCase } from "./reject-tool-call.use-case";

describe("RejectToolCallUseCase", () => {
	it("sends the refusal with the reason a human gave", async () => {
		const concierge = new RecordingConcierge();
		const refusals = new RejectToolCallUseCase(concierge);

		const result = await refusals.execute("session-9", "call-1", "amount above the agreement", "manager@nebula.test");

		expect(concierge.decided).toEqual(["reject:session-9:call-1:amount above the agreement:manager@nebula.test"]);
		expect(result.text).toBe("rejected");
	});
});
