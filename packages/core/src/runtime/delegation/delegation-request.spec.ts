import { describe, expect, it } from "vitest";
import { DelegationRequest } from "./delegation-request";

describe("DelegationRequest", () => {
	it("carries the agent and the task exactly as they were asked for", () => {
		const request = new DelegationRequest("researcher", "find the refund policy for EU orders");

		expect(request.agentName).toBe("researcher");
		expect(request.task).toBe("find the refund policy for EU orders");
	});
});
