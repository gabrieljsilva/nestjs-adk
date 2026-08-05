import { describe, expect, it } from "vitest";
import { ToolSourceUnavailableError } from "./tool-source-unavailable.error";

describe("ToolSourceUnavailableError", () => {
	it("names the source and why it could not be reached", () => {
		const error = new ToolSourceUnavailableError("github", new Error("connect ECONNREFUSED"));

		expect(error.code).toBe("TOOL_SOURCE_UNAVAILABLE");
		expect(error.message).toContain("github");
		expect(error.message).toContain("ECONNREFUSED");
	});

	it("keeps the cause, so a log can say more than the message does", () => {
		const cause = new Error("boom");

		expect(new ToolSourceUnavailableError("github", cause).cause).toBe(cause);
	});
});
