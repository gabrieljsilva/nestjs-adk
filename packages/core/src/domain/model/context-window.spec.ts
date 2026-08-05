import { describe, expect, it } from "vitest";
import { ContextWindow } from "./context-window";
import { ModelContextWindow } from "./model-context-window";
import { UnknownContextWindow } from "./unknown-context-window";

describe("ContextWindow", () => {
	it("has exactly two shapes, the declared one and the unknown one", () => {
		const windows: ContextWindow[] = [ModelContextWindow.of(100, 20), new UnknownContextWindow()];

		expect(windows.map((window) => window.isKnown)).toEqual([true, false]);
	});

	it("lets a caller ask whether content fits without knowing which shape it holds", () => {
		const windows: ContextWindow[] = [ModelContextWindow.of(100, 20), new UnknownContextWindow()];

		expect(windows.map((window) => window.fits(90))).toEqual([false, true]);
	});
});
