import { describe, expect, it } from "vitest";
import { ToolAccess } from "./tool-access.value-object";

describe("ToolAccess", () => {
	it("grants with no reason to give", () => {
		const access = ToolAccess.granted();

		expect(access.isGranted).toBe(true);
		expect(access.isDenied).toBe(false);
		expect(access.reason).toBe("");
	});

	it("denies with the reason it was given", () => {
		const access = ToolAccess.denied("  missing scope mcp:refund ");

		expect(access.isDenied).toBe(true);
		expect(access.reason).toBe("missing scope mcp:refund");
	});

	it("never denies without a reason", () => {
		expect(ToolAccess.denied("   ").reason).toBe("Access to this tool was denied.");
	});
});
