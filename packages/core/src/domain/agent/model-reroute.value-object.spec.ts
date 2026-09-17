import { describe, expect, it } from "vitest";
import { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import { RateLimitedFailure } from "../model/failures/rate-limited-failure.value-object";
import { ModelReroute } from "./model-reroute.value-object";

const PRIMARY = new ModelIdentity("acme", "primary");
const FALLBACK = new ModelIdentity("acme", "fallback");

describe("ModelReroute", () => {
	it("records where the call went and where it came from", () => {
		const reroute = new ModelReroute(PRIMARY, FALLBACK, new RateLimitedFailure("slow down"), 1);

		expect(reroute.from.toString()).toBe("acme/primary");
		expect(reroute.to.toString()).toBe("acme/fallback");
	});

	it("records the failure that caused it and the attempt it happened on", () => {
		const reroute = new ModelReroute(PRIMARY, FALLBACK, new RateLimitedFailure("slow down"), 2);

		expect(reroute.failure.kind).toBe("rate-limited");
		expect(reroute.attempt).toBe(2);
	});
});
