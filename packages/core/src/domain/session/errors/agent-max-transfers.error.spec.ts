import { describe, expect, it } from "vitest";
import { AgentMaxTransfersError } from "./agent-max-transfers.error";

describe("AgentMaxTransfersError", () => {
	it("names the agent holding the session and the limit it hit", () => {
		const error = new AgentMaxTransfersError("billing", 8);

		expect(error.code).toBe("AGENT_MAX_TRANSFERS");
		expect(error.agent).toBe("billing");
		expect(error.limit).toBe(8);
		expect(error.message).toContain("8 transfer(s)");
	});
});
