import { AdkAgent, AgentNotBoundError, MethodPromptBuilder } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { ClubRulesAgent } from "./club-rules.agent";

describe("ClubRulesAgent", () => {
	it("is an agent an application can inject as itself", () => {
		expect(new ClubRulesAgent()).toBeInstanceOf(AdkAgent);
	});

	it("declares a prompt the runtime builds per run, even with nothing to interpolate", () => {
		expect(MethodPromptBuilder.forInstance(new ClubRulesAgent())).toBeInstanceOf(MethodPromptBuilder);
	});

	/** Reading a file needs the toolkit the module hands over, so an unbound agent says so. */
	it("refuses to read anything before the module bound it", async () => {
		await expect(MethodPromptBuilder.forInstance(new ClubRulesAgent())?.build({} as never)).rejects.toBeInstanceOf(
			AgentNotBoundError,
		);
	});
});
