import { AdkAgent, AgentNotBoundError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { ConciergeAgent } from "./concierge.agent";

describe("ConciergeAgent", () => {
	it("is an agent an application can inject as itself", () => {
		expect(new ConciergeAgent()).toBeInstanceOf(AdkAgent);
	});

	it("says it is not wired instead of answering half wired", async () => {
		await expect(new ConciergeAgent().ask("meu controle quebrou")).rejects.toBeInstanceOf(AgentNotBoundError);
	});

	it("names the class in the failure, so the missing provider is findable", async () => {
		await expect(new ConciergeAgent().ask("oi")).rejects.toThrow("ConciergeAgent");
	});
});
