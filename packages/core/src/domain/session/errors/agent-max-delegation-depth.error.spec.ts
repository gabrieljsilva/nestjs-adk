import { describe, expect, it } from "vitest";
import { AgentMaxDelegationDepthError } from "./agent-max-delegation-depth.error";

describe("AgentMaxDelegationDepthError", () => {
	it("names the agent that tried to go deeper and the depth it hit", () => {
		const error = new AgentMaxDelegationDepthError("researcher", 3);

		expect(error.code).toBe("AGENT_MAX_DELEGATION_DEPTH");
		expect(error.agent).toBe("researcher");
		expect(error.limit).toBe(3);
		expect(error.message).toContain("depth of 3");
	});
});
