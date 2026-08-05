import { describe, expect, it } from "vitest";
import { DelegationNotDeclaredError } from "./delegation-not-declared.error";

describe("DelegationNotDeclaredError", () => {
	it("says who refused, who was asked for and what was declared", () => {
		const error = new DelegationNotDeclaredError("support", "legal", ["researcher"]);

		expect(error.code).toBe("DELEGATION_NOT_DECLARED");
		expect(error.message).toContain("support");
		expect(error.message).toContain("legal");
		expect(error.message).toContain("researcher");
	});

	it("says none when the agent declared no edge at all", () => {
		expect(new DelegationNotDeclaredError("support", "legal", []).message).toContain("Declared: none");
	});
});
