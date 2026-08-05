import { describe, expect, it } from "vitest";
import { OffloadPolicy } from "./offload-policy";

describe("OffloadPolicy", () => {
	it("offloads above twenty thousand characters by default, and not at it", () => {
		const policy = OffloadPolicy.byDefault();

		expect(policy.shouldOffload(OffloadPolicy.DEFAULT_THRESHOLD)).toBe(false);
		expect(policy.shouldOffload(OffloadPolicy.DEFAULT_THRESHOLD + 1)).toBe(true);
	});

	it("takes the threshold an application chose instead", () => {
		const policy = OffloadPolicy.above(10);

		expect(policy.shouldOffload(11)).toBe(true);
		expect(policy.thresholdCharacters).toBe(10);
	});

	it("moves nothing at all when it is disabled", () => {
		const policy = OffloadPolicy.disabled();

		expect(policy.isEnabled).toBe(false);
		expect(policy.shouldOffload(1_000_000)).toBe(false);
		expect(policy.thresholdCharacters).toBeUndefined();
	});

	it("normalizes a threshold that makes no sense as a count", () => {
		expect(OffloadPolicy.above(-5).thresholdCharacters).toBe(0);
		expect(OffloadPolicy.above(9.9).thresholdCharacters).toBe(9);
	});
});
