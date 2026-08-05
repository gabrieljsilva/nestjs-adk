import { describe, expect, it } from "vitest";
import { ContextWindow } from "./context-window";
import { ModelContextWindow } from "./model-context-window";

describe("ModelContextWindow", () => {
	it("declares itself known", () => {
		expect(ModelContextWindow.of(100, 20).isKnown).toBe(true);
	});

	it("leaves the reserved output out of the input room", () => {
		expect(ModelContextWindow.of(100, 20).inputTokens).toBe(80);
	});

	it("never reserves more than the window holds", () => {
		expect(ModelContextWindow.of(50, 90).reservedOutputTokens).toBe(50);
		expect(ModelContextWindow.of(50, 90).inputTokens).toBe(0);
	});

	it("reports zero available instead of a negative budget", () => {
		expect(ModelContextWindow.of(100, 20).available(500)).toBe(0);
	});

	it("fits exactly at the input limit", () => {
		const window = ModelContextWindow.of(100, 20);

		expect(window.fits(80)).toBe(true);
		expect(window.fits(81)).toBe(false);
	});

	it("truncates fractional tokens and refuses negatives", () => {
		const window = ModelContextWindow.of(100.9, -5);

		expect(window.totalTokens).toBe(100);
		expect(window.reservedOutputTokens).toBe(0);
	});

	it("is a context window", () => {
		expect(ModelContextWindow.of(100, 20)).toBeInstanceOf(ContextWindow);
	});
});
