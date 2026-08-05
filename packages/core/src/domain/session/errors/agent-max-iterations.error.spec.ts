import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { AgentMaxIterationsError } from "./agent-max-iterations.error";

describe("AgentMaxIterationsError", () => {
	it("names the agent and the limit it reached", () => {
		const error = new AgentMaxIterationsError("support", 8);

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("AGENT_MAX_ITERATIONS");
		expect(error.message).toContain("support");
		expect(error.message).toContain("8");
	});
});
