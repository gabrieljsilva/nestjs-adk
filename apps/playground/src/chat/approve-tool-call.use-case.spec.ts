import { describe, expect, it } from "vitest";
import { ApproveToolCallUseCase } from "./approve-tool-call.use-case";
import { RecordingConcierge } from "./recording-concierge.fixture";

describe("ApproveToolCallUseCase", () => {
	it("sends the approval to the call that is waiting, with who approved it", async () => {
		const concierge = new RecordingConcierge();
		const approvals = new ApproveToolCallUseCase(concierge);

		const result = await approvals.execute("session-9", "call-1", "manager@nebula.test");

		expect(concierge.decided).toEqual(["approve:session-9:call-1:manager@nebula.test"]);
		expect(result.text).toBe("approved");
	});
});
