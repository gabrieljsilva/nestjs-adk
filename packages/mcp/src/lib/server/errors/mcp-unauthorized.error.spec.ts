import { AdkError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { McpUnauthorizedError } from "./mcp-unauthorized.error";

describe("McpUnauthorizedError", () => {
	it("carries the reason and the challenge the endpoint writes back", () => {
		const error = new McpUnauthorizedError("token expired", 'Bearer resource_metadata="https://api/.well-known/x"');

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("MCP_UNAUTHORIZED");
		expect(error.reason).toBe("token expired");
		expect(error.challenge).toContain("resource_metadata");
		expect(error.message).toContain("token expired");
	});

	it("may carry no challenge, for a server that has nowhere to send a person", () => {
		expect(new McpUnauthorizedError("no key").challenge).toBeUndefined();
	});
});
