import { beforeEach, describe, expect, it } from "vitest";
import { ApproveToolCallUseCase } from "./approve-tool-call.use-case";
import { RecordingConcierge } from "./recording-concierge.fixture";

let concierge: RecordingConcierge;
let approvals: ApproveToolCallUseCase;

beforeEach(() => {
	concierge = new RecordingConcierge();
	approvals = new ApproveToolCallUseCase(concierge);
});

describe("ApproveToolCallUseCase", () => {
	it("sends the approval to the call that is waiting, with who approved it", async () => {
		const result = await approvals.execute("session-9", "call-1", "gerente@nebula.test");

		expect(concierge.decided).toEqual(["approve:session-9:call-1:gerente@nebula.test"]);
		expect(result.text).toBe("aprovado");
	});
});
