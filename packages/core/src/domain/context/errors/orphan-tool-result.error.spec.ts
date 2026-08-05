import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { OrphanToolResultError } from "./orphan-tool-result.error";

describe("OrphanToolResultError", () => {
	it("carries a stable code", () => {
		expect(new OrphanToolResultError("call-1", "search").code).toBe("CONTEXT_ORPHAN_TOOL_RESULT");
	});

	it("names the call and the tool", () => {
		const error = new OrphanToolResultError("call-1", "search");

		expect(error.message).toContain("call-1");
		expect(error.message).toContain("search");
	});

	it("is an adk error", () => {
		expect(new OrphanToolResultError("call-1", "search")).toBeInstanceOf(AdkError);
	});
});
