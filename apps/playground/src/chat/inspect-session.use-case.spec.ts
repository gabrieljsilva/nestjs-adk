import { describe, expect, it } from "vitest";
import { InspectSessionUseCase } from "./inspect-session.use-case";
import { RecordingConcierge } from "./recording-concierge.fixture";

describe("InspectSessionUseCase", () => {
	it("asks about the session it was given, and adds nothing to the answer", async () => {
		const concierge = new RecordingConcierge();
		const sessions = new InspectSessionUseCase(concierge);

		await expect(sessions.execute("session-9")).rejects.toThrow("no runtime behind this agent");

		expect(concierge.inspected).toBe("session-9");
	});
});
