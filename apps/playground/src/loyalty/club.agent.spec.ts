import { AdkAgent, AgentNotBoundError, MethodPromptBuilder } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { ClubAgent } from "./club.agent";
import { FindMemberUseCase } from "./find-member.use-case";
import { MemberRepository } from "./member.repository";

function agent(): ClubAgent {
	return new ClubAgent(new FindMemberUseCase(new MemberRepository()));
}

describe("ClubAgent", () => {
	it("is an agent an application can inject as itself", () => {
		expect(agent()).toBeInstanceOf(AdkAgent);
	});

	/** The whole point of the class: overriding the method is what declares a prompt per run. */
	it("declares a prompt the runtime builds per run", () => {
		expect(MethodPromptBuilder.forInstance(agent())).toBeInstanceOf(MethodPromptBuilder);
	});

	it("says it is not wired instead of rendering half wired", async () => {
		await expect(agent().ask("how many points do I have?")).rejects.toBeInstanceOf(AgentNotBoundError);
	});
});
