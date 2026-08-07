import { AdkAgent, AgentNotBoundError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { SalesAgent } from "./sales.agent";

describe("SalesAgent", () => {
	it("is an agent an application can inject as itself", () => {
		expect(new SalesAgent()).toBeInstanceOf(AdkAgent);
	});

	it("answers the tone the sector always speaks in", () => {
		expect(new SalesAgent().tone()).toContain("reais");
	});

	it("holds the club rules as text, which is what a skill is", () => {
		expect(new SalesAgent().clubPolicy()).toContain("10%");
	});

	it("says it is not wired instead of answering half wired", async () => {
		await expect(new SalesAgent().ask("how much does it cost")).rejects.toBeInstanceOf(AgentNotBoundError);
	});
});
