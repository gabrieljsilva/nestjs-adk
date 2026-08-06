import { beforeEach, describe, expect, it } from "vitest";
import { RecordingConcierge } from "./recording-concierge.fixture";
import { RejectToolCallUseCase } from "./reject-tool-call.use-case";

let concierge: RecordingConcierge;
let refusals: RejectToolCallUseCase;

beforeEach(() => {
	concierge = new RecordingConcierge();
	refusals = new RejectToolCallUseCase(concierge);
});

describe("RejectToolCallUseCase", () => {
	it("sends the refusal with the reason a human gave", async () => {
		const result = await refusals.execute("session-9", "call-1", "valor acima do combinado", "gerente@nebula.test");

		expect(concierge.decided).toEqual(["reject:session-9:call-1:valor acima do combinado:gerente@nebula.test"]);
		expect(result.text).toBe("recusado");
	});
});
