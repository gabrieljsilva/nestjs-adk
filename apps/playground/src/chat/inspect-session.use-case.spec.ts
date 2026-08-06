import { beforeEach, describe, expect, it } from "vitest";
import { InspectSessionUseCase } from "./inspect-session.use-case";
import { RecordingConcierge } from "./recording-concierge.fixture";

let concierge: RecordingConcierge;
let sessions: InspectSessionUseCase;

beforeEach(() => {
	concierge = new RecordingConcierge();
	sessions = new InspectSessionUseCase(concierge);
});

describe("InspectSessionUseCase", () => {
	it("asks about the session it was given, and adds nothing to the answer", async () => {
		await expect(sessions.execute("session-9")).rejects.toThrow("no runtime behind this agent");

		expect(concierge.inspected).toBe("session-9");
	});
});
