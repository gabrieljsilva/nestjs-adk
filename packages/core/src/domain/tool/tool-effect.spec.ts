import { describe, expect, it } from "vitest";
import { ToolEffect } from "./tool-effect";

describe("ToolEffect", () => {
	it("orders read below write below destructive", () => {
		expect(ToolEffect.DESTRUCTIVE.isAtLeast(ToolEffect.WRITE)).toBe(true);
		expect(ToolEffect.WRITE.isAtLeast(ToolEffect.READ)).toBe(true);
		expect(ToolEffect.READ.isAtLeast(ToolEffect.WRITE)).toBe(false);
	});

	it("counts an effect as at least itself", () => {
		expect(ToolEffect.WRITE.isAtLeast(ToolEffect.WRITE)).toBe(true);
	});

	it("resolves the name a declaration carried", () => {
		expect(ToolEffect.of("destructive")).toBe(ToolEffect.DESTRUCTIVE);
		expect(ToolEffect.of("catastrophic")).toBeUndefined();
	});

	it("reads as the word the author wrote", () => {
		expect(`${ToolEffect.READ}`).toBe("read");
	});
});
