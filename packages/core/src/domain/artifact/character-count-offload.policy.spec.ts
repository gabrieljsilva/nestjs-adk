import { describe, expect, it } from "vitest";
import { CharacterCountOffloadPolicy } from "./character-count-offload.policy";
import { OffloadDecision } from "./offload-decision.value-object";
import { OffloadPolicy } from "./offload.policy";

describe("CharacterCountOffloadPolicy", () => {
	it("keeps a result of exactly the threshold and moves out the one after it", () => {
		const policy = CharacterCountOffloadPolicy.byDefault();

		expect(policy.shouldOffload(CharacterCountOffloadPolicy.DEFAULT_THRESHOLD)).toBe(false);
		expect(policy.shouldOffload(CharacterCountOffloadPolicy.DEFAULT_THRESHOLD + 1)).toBe(true);
	});

	it("decides on the threshold it was given", () => {
		const policy = CharacterCountOffloadPolicy.above(10);

		expect(policy.shouldOffload(10)).toBe(false);
		expect(policy.shouldOffload(11)).toBe(true);
		expect(policy.thresholdCharacters).toBe(10);
	});

	it("moves nothing out when it was disabled, however long the result is", () => {
		const policy = CharacterCountOffloadPolicy.disabled();

		expect(policy.shouldOffload(1_000_000)).toBe(false);
		expect(policy.decide(1_000_000, "application/json")).toBe(OffloadDecision.INLINE);
		expect(policy.isEnabled).toBe(false);
		expect(policy.thresholdCharacters).toBeUndefined();
	});

	it("normalizes a threshold nobody could have meant", () => {
		expect(CharacterCountOffloadPolicy.above(-5).thresholdCharacters).toBe(0);
		expect(CharacterCountOffloadPolicy.above(9.9).thresholdCharacters).toBe(9);
	});

	it("is the shipped default of a port an application may replace", () => {
		expect(CharacterCountOffloadPolicy.byDefault()).toBeInstanceOf(OffloadPolicy);
	});

	it("calls JSON and text explorable, because the exploration tools were written against them", () => {
		const policy = CharacterCountOffloadPolicy.above(10);

		expect(policy.decide(11, "application/json")).toBe(OffloadDecision.EXPLORABLE);
		expect(policy.decide(11, "application/problem+json")).toBe(OffloadDecision.EXPLORABLE);
		expect(policy.decide(11, "text/plain")).toBe(OffloadDecision.EXPLORABLE);
		expect(policy.decide(11, "TEXT/Markdown")).toBe(OffloadDecision.EXPLORABLE);
	});

	it("calls everything else opaque, including content that declared nothing at all", () => {
		const policy = CharacterCountOffloadPolicy.above(10);

		expect(policy.decide(11, "image/png")).toBe(OffloadDecision.OPAQUE);
		expect(policy.decide(11, "application/octet-stream")).toBe(OffloadDecision.OPAQUE);
		expect(policy.decide(11)).toBe(OffloadDecision.OPAQUE);
	});

	it("decides nothing about size on the media type: a short JSON still stays where it is", () => {
		expect(CharacterCountOffloadPolicy.above(10).decide(10, "application/json")).toBe(OffloadDecision.INLINE);
	});
});
