import { describe, expect, it } from "vitest";
import { UnknownDelegationTargetError } from "./unknown-delegation-target.error";

describe("UnknownDelegationTargetError", () => {
	it("names the agent, the target and what is registered", () => {
		const error = new UnknownDelegationTargetError("support", "researcher", ["support"]);

		expect(error.code).toBe("CATALOG_UNKNOWN_DELEGATION_TARGET");
		expect(error.message).toContain("researcher");
		expect(error.message).toContain("Known agents: support");
	});

	it("says none when nothing is registered", () => {
		expect(new UnknownDelegationTargetError("support", "researcher", []).message).toContain("none");
	});
});
