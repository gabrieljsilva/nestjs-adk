import { describe, expect, it } from "vitest";
import { InvalidRunLimitError } from "./errors/invalid-run-limit.error";
import { RunLimits } from "./run-limits";

describe("RunLimits", () => {
	it("declares nothing by default, so no iteration cap exists", () => {
		const limits = RunLimits.none();

		expect(limits.hasIterationLimit).toBe(false);
		expect(limits.allowsIteration(1000)).toBe(true);
	});

	it("still answers the invalid argument limit when nobody declared one", () => {
		expect(RunLimits.none().invalidArgsLimit).toBe(RunLimits.DEFAULT_MAX_INVALID_ARGS);
		expect(RunLimits.none().allowsInvalidArgs(2)).toBe(false);
	});

	it("stops the iteration after the declared number of them", () => {
		const limits = RunLimits.of(3);

		expect(limits.allowsIteration(2)).toBe(true);
		expect(limits.allowsIteration(3)).toBe(false);
	});

	it("lets the level that declared a field win it, field by field", () => {
		const resolved = RunLimits.of(10, 5).overriddenBy(RunLimits.of(2));

		expect(resolved.maxIterations).toBe(2);
		expect(resolved.maxConsecutiveToolFailures).toBe(5);
	});

	it("keeps what it had when the level under it declared nothing", () => {
		const resolved = RunLimits.of(10).overriddenBy(RunLimits.none());

		expect(resolved.maxIterations).toBe(10);
	});

	it("keeps what it had when there is no narrower level at all", () => {
		expect(RunLimits.of(10).overriddenBy().maxIterations).toBe(10);
	});

	it("refuses zero, which would stop every run before its first iteration", () => {
		expect(() => RunLimits.of(0)).toThrow(InvalidRunLimitError);
	});

	it("counts consecutive failures of a tool against the declared limit", () => {
		const limits = RunLimits.of(undefined, 2);

		expect(limits.allowsToolFailures(1)).toBe(true);
		expect(limits.allowsToolFailures(2)).toBe(false);
		expect(RunLimits.none().allowsToolFailures(99)).toBe(true);
	});

	it("refuses a fractional or negative declaration instead of quietly reading it as something else", () => {
		expect(() => RunLimits.of(3.9)).toThrow(InvalidRunLimitError);
		expect(() => RunLimits.of(undefined, -1)).toThrow(InvalidRunLimitError);
		expect(() => RunLimits.of(undefined, undefined, Number.NaN)).toThrow(InvalidRunLimitError);
	});

	it("names the limit that was declared badly, so the fix is where the mistake is", () => {
		const failure = ((): unknown => {
			try {
				RunLimits.of(undefined, -1);
				return undefined;
			} catch (error) {
				return error;
			}
		})();

		expect(failure).toBeInstanceOf(InvalidRunLimitError);
		if (failure instanceof InvalidRunLimitError) expect(failure.limit).toBe("maxConsecutiveToolFailures");
	});
});
