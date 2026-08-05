import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { ContextBudgetExceededError } from "./context-budget-exceeded.error";

describe("ContextBudgetExceededError", () => {
	it("carries a stable code", () => {
		expect(new ContextBudgetExceededError("google/flash", 900, 800).code).toBe("CONTEXT_BUDGET_EXCEEDED");
	});

	it("states how much was asked for and how much there was", () => {
		const error = new ContextBudgetExceededError("google/flash", 900, 800);

		expect(error.message).toContain("900");
		expect(error.message).toContain("800");
		expect(error.message).toContain("google/flash");
	});

	it("is an adk error", () => {
		expect(new ContextBudgetExceededError("google/flash", 900, 800)).toBeInstanceOf(AdkError);
	});
});
