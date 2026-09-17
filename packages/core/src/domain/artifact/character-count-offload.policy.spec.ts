import { describe, expect, it } from "vitest";
import { CharacterCountOffloadPolicy } from "./character-count-offload.policy";
import { OffloadPolicy } from "./offload.policy";

describe("CharacterCountOffloadPolicy", () => {
	it("offloads above twenty thousand characters by default, and not at it", () => {
		const policy = CharacterCountOffloadPolicy.byDefault();

		expect(policy.shouldOffload(CharacterCountOffloadPolicy.DEFAULT_THRESHOLD)).toBe(false);
		expect(policy.shouldOffload(CharacterCountOffloadPolicy.DEFAULT_THRESHOLD + 1)).toBe(true);
	});

	it("takes the threshold an application chose instead", () => {
		const policy = CharacterCountOffloadPolicy.above(10);

		expect(policy.shouldOffload(11)).toBe(true);
		expect(policy.thresholdCharacters).toBe(10);
	});

	it("moves nothing at all when it is disabled", () => {
		const policy = CharacterCountOffloadPolicy.disabled();

		expect(policy.isEnabled).toBe(false);
		expect(policy.shouldOffload(1_000_000)).toBe(false);
		expect(policy.thresholdCharacters).toBeUndefined();
	});

	it("normalizes a threshold that makes no sense as a count", () => {
		expect(CharacterCountOffloadPolicy.above(-5).thresholdCharacters).toBe(0);
		expect(CharacterCountOffloadPolicy.above(9.9).thresholdCharacters).toBe(9);
	});

	it("is the port the runtime asks, so an application can answer it differently", () => {
		expect(CharacterCountOffloadPolicy.byDefault()).toBeInstanceOf(OffloadPolicy);
	});
});
