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

	it("builds from a literal with the same defaults as declaring none", () => {
		const options = RuntimeOptions.from({ limits: RunLimits.of(3) });

		expect(options.limits.maxIterations).toBe(3);
		expect(options.shutdown.waitsIndefinitely).toBe(true);
		expect(options.consumers).toHaveLength(0);
	});

	it("patches only the named fields and keeps every other one", () => {
		const declared = new RuntimeOptions(ShutdownOptions.withTimeout(1000), RunLimits.of(6));

		const patched = declared.with({ limits: RunLimits.of(2) });

		expect(patched.limits.maxIterations).toBe(2);
		expect(patched.shutdown).toBe(declared.shutdown);
		expect(patched.approvals).toBe(declared.approvals);
	});

	it("answers a new instance from a patch, leaving the original untouched", () => {
		const declared = new RuntimeOptions();

		const patched = declared.with({ limits: RunLimits.of(2) });

		expect(patched).not.toBe(declared);
		expect(declared.limits.hasIterationLimit).toBe(false);
	});
});
