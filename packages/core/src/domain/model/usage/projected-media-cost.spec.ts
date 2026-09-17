import { describe, expect, it } from "vitest";
import { ProjectedMediaCost } from "./projected-media-cost";

describe("ProjectedMediaCost", () => {
	it("prices an image as the band a provider bills, not as its payload", () => {
		expect(ProjectedMediaCost.ofImage().characters).toBe(258 * 4);
	});

	it("converts tokens into the unit a context is measured in", () => {
		expect(ProjectedMediaCost.ofTokens(10).characters).toBe(40);
	});

	it("never projects a negative or fractional cost", () => {
		expect(ProjectedMediaCost.ofTokens(-5).characters).toBe(0);
		expect(ProjectedMediaCost.ofTokens(2.9).characters).toBe(8);
	});
});
