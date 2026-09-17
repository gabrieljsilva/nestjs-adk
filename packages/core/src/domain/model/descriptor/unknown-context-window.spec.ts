import { describe, expect, it } from "vitest";
import { ContextWindow } from "./context-window";
import { UnknownContextWindow } from "./unknown-context-window";

describe("UnknownContextWindow", () => {
	it("declares itself unknown", () => {
		expect(new UnknownContextWindow().isKnown).toBe(false);
	});

	it("accepts any size, because refusing against an unstated limit invents the limit", () => {
		const window = new UnknownContextWindow();

		expect(window.fits(0)).toBe(true);
		expect(window.fits(10_000_000)).toBe(true);
	});

	it("reserves nothing, since no number was declared to reserve from", () => {
		expect(new UnknownContextWindow().reservedOutputTokens).toBe(0);
	});

	it("is a context window", () => {
		expect(new UnknownContextWindow()).toBeInstanceOf(ContextWindow);
	});
});
