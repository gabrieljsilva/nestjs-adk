import { describe, expect, it } from "vitest";
import { McpBlockedTargetError } from "./mcp-blocked-target.error";

describe("McpBlockedTargetError", () => {
	it("names the address it refused and why", () => {
		const error = new McpBlockedTargetError("http://127.0.0.1", "loopback is not a target");

		expect(error.code).toBe("MCP_BLOCKED_TARGET");
		expect(error.message).toContain("127.0.0.1");
		expect(error.message).toContain("loopback");
	});
});
