import { describe, expect, it } from "vitest";
import { McpCall } from "./mcp-call";

describe("McpCall", () => {
	it("names the session, run and call after the request, under the mcp prefix", () => {
		const call = McpCall.of(7, "sess-1");

		expect(call.sessionId.value).toBe("mcp:sess-1");
		expect(call.runId.value).toBe("mcp:7");
		expect(call.callId.value).toBe("mcp:7");
		expect(call.agent.value).toBe("mcp");
	});

	it("names a stateless session when the transport keeps none", () => {
		expect(McpCall.of("r-1").sessionId.value).toBe("mcp:stateless");
	});

	it("carries the request's own cancellation", () => {
		const controller = new AbortController();

		expect(McpCall.of(1, undefined, controller.signal).signal).toBe(controller.signal);
	});
});
