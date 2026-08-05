import { describe, expect, it } from "vitest";
import { TransferNotDeclaredError } from "./transfer-not-declared.error";

describe("TransferNotDeclaredError", () => {
	it("says who refused, who was asked for, and what was declared instead", () => {
		const error = new TransferNotDeclaredError("support", "legal", ["billing", "escalation"]);

		expect(error.code).toBe("TRANSFER_NOT_DECLARED");
		expect(error.message).toContain("support");
		expect(error.message).toContain("legal");
		expect(error.message).toContain("billing, escalation");
	});

	it("says none rather than nothing when the agent declared no edge", () => {
		expect(new TransferNotDeclaredError("support", "legal", []).message).toContain("Declared: none");
	});
});
