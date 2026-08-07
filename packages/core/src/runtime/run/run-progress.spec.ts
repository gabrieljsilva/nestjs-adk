import { describe, expect, it } from "vitest";
import { SessionRevision } from "../../common/revision/session-revision";
import { BilledCall } from "../../domain/cost/billed-call";
import { ModelIdentity } from "../../domain/model/model-identity";
import { ModelUsage } from "../../domain/model/model-usage";
import { SessionState } from "../../domain/session/session-state";
import { RunProgress } from "./run-progress";

const LUNA = ModelIdentity.of("openai", "gpt-5.6-luna");
const FLASH = ModelIdentity.of("google", "gemini-3.5-flash-lite");

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

	it("owes nothing before a model has answered", () => {
		expect(new RunProgress(SessionState.initial()).billed).toEqual([]);
	});

	it("keeps every call in the order it was charged", () => {
		const progress = new RunProgress(SessionState.initial());

		progress.charged(new BilledCall(LUNA, ModelUsage.of(10, 2)));
		progress.charged(new BilledCall(FLASH, ModelUsage.of(20, 4)));

		expect(progress.billed.map((call) => call.model.toString())).toEqual([LUNA.toString(), FLASH.toString()]);
	});

	/** How a delegation hands its bill to the parent: one call, several calls at once. */
	it("takes a whole run's calls in one go", () => {
		const child = new RunProgress(SessionState.initial());
		child.charged(new BilledCall(FLASH, ModelUsage.of(1, 1)), new BilledCall(FLASH, ModelUsage.of(2, 2)));
		const parent = new RunProgress(SessionState.initial());
		parent.charged(new BilledCall(LUNA, ModelUsage.of(3, 3)));

		parent.charged(...child.billed);

		expect(parent.billed).toHaveLength(3);
		expect(child.billed).toHaveLength(2);
	});
});
