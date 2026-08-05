import { describe, expect, it } from "vitest";
import { UnknownTransferTargetError } from "./unknown-transfer-target.error";

describe("UnknownTransferTargetError", () => {
	it("names the agent, the target it declared and what is actually registered", () => {
		const error = new UnknownTransferTargetError("support", "billing", ["support", "legal"]);

		expect(error.code).toBe("CATALOG_UNKNOWN_TRANSFER_TARGET");
		expect(error.message).toContain("support");
		expect(error.message).toContain("billing");
		expect(error.message).toContain("support, legal");
	});

	it("says none when nothing at all is registered", () => {
		expect(new UnknownTransferTargetError("support", "billing", []).message).toContain("Known agents: none");
	});
});
