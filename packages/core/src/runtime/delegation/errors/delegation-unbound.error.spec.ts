import { describe, expect, it } from "vitest";
import { DelegationUnboundError } from "./delegation-unbound.error";

describe("DelegationUnboundError", () => {
	it("says the composition skipped a step", () => {
		const error = new DelegationUnboundError();

		expect(error.code).toBe("DELEGATION_UNBOUND");
		expect(error.message).toContain("turn loop");
	});
});
