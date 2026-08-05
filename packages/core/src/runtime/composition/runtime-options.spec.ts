import { describe, expect, it } from "vitest";
import { RunLimits } from "../../domain/session/run-limits";
import { ShutdownOptions } from "../lifecycle/shutdown-options";
import { RuntimeOptions } from "./runtime-options";

describe("RuntimeOptions", () => {
	it("waits indefinitely and declares no limit when the application chose nothing", () => {
		const options = new RuntimeOptions();

		expect(options.shutdown.waitsIndefinitely).toBe(true);
		expect(options.limits.hasIterationLimit).toBe(false);
	});

	it("leaves the optional ports absent rather than substituting a default for them", () => {
		const options = new RuntimeOptions();

		expect(options.models).toBeUndefined();
		expect(options.summarizer).toBeUndefined();
		expect(options.contextNotices).toBeUndefined();
		expect(options.consumerNotices).toBeUndefined();
	});

	it("watches nothing until somebody declares a consumer", () => {
		expect(new RuntimeOptions().consumers).toHaveLength(0);
	});

	it("carries the module wide limits the agent and the call may narrow", () => {
		const options = new RuntimeOptions(ShutdownOptions.withTimeout(1000), RunLimits.of(6));

		expect(options.limits.maxIterations).toBe(6);
		expect(options.shutdown.waitsIndefinitely).toBe(false);
	});
});
