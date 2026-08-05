import { describe, expect, it } from "vitest";
import { SessionRevision } from "../../common/revision/session-revision";
import { SessionState } from "../../domain/session/session-state";
import { RunProgress } from "./run-progress";

describe("RunProgress", () => {
	it("starts where the journal was and says nothing yet", () => {
		const progress = new RunProgress(SessionState.initial());

		expect(progress.state.revision.value).toBe(0);
		expect(progress.answer).toBe("");
	});

	it("moves forward as the journal does", () => {
		const progress = new RunProgress(SessionState.initial());

		progress.advanced(SessionState.initial().at(SessionRevision.of(3)));

		expect(progress.state.revision.value).toBe(3);
	});

	it("is not waiting on anybody until it says so", () => {
		const progress = new RunProgress(SessionState.initial());

		expect(progress.isSuspended).toBe(false);
		progress.suspend();
		expect(progress.isSuspended).toBe(true);
	});

	it("keeps the last thing the model said", () => {
		const progress = new RunProgress(SessionState.initial());

		progress.said("first");
		progress.said("second");

		expect(progress.answer).toBe("second");
	});
});
