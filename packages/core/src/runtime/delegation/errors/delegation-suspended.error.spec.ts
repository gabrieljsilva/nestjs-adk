import { describe, expect, it } from "vitest";
import { DelegationSuspendedError } from "./delegation-suspended.error";

describe("DelegationSuspendedError", () => {
	it("names both agents and says what to do instead", () => {
		const error = new DelegationSuspendedError("support", "researcher");

		expect(error.code).toBe("DELEGATION_SUSPENDED");
		expect(error.message).toContain("support");
		expect(error.message).toContain("researcher");
		expect(error.message).toContain("transfer");
	});
});
