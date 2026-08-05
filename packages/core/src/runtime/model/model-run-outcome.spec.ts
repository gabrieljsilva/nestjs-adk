import { describe, expect, it } from "vitest";
import { ModelReroute } from "../../domain/agent/model-reroute";
import { ModelIdentity } from "../../domain/model/model-identity";
import { ModelResponse } from "../../domain/model/model-response";
import { RateLimitedFailure } from "../../domain/model/rate-limited-failure";
import { ModelRunOutcome } from "./model-run-outcome";

const PRIMARY = ModelIdentity.of("acme", "primary");
const FALLBACK = ModelIdentity.of("acme", "fallback");

describe("ModelRunOutcome", () => {
	it("reports the model that answered as the one the cost belongs to", () => {
		const outcome = new ModelRunOutcome(new ModelResponse(FALLBACK, "hi"));

		expect(outcome.servedBy.toString()).toBe("acme/fallback");
	});

	it("was not rerouted when nothing failed", () => {
		expect(new ModelRunOutcome(new ModelResponse(PRIMARY, "hi")).wasRerouted).toBe(false);
	});

	it("carries the reroutes in the order they happened, for the run to append", () => {
		const outcome = new ModelRunOutcome(new ModelResponse(FALLBACK, "hi"), [
			new ModelReroute(PRIMARY, FALLBACK, new RateLimitedFailure("slow down"), 1),
		]);

		expect(outcome.wasRerouted).toBe(true);
		expect(outcome.reroutes[0]?.to.toString()).toBe("acme/fallback");
	});
});
