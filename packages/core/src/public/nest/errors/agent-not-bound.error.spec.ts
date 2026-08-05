import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { AgentNotBoundError } from "./agent-not-bound.error";

describe("AgentNotBoundError", () => {
	it("names the class and what to check, because every cause is a wiring mistake", () => {
		const error = new AgentNotBoundError("SupportAgent");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("AGENT_NOT_BOUND");
		expect(error.message).toContain("SupportAgent");
		expect(error.message).toContain("@Agent");
	});
});
