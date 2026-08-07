import { AdkAgent, AgentPrompting, FileSystemPromptSource, MethodPromptBuilder, PromptContext } from "@nestjs-adk/core";
import { AgentHandle, AgentName, AgentRunId, SessionId } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { ClubGuestAgent } from "./club-guest.agent";

const CONTEXT = new PromptContext(SessionId.from("s-42"), AgentRunId.from("r-1"), AgentName.from("club-guest"));

/** Bound the way the module binds it, which is the only way `this.prompting` answers. */
function bound(): ClubGuestAgent {
	const agent = new ClubGuestAgent();
	agent.bindTo(
		new AgentHandle(AgentName.from("club-guest"), Object.create(null)),
		new AgentPrompting(new FileSystemPromptSource()),
	);
	return agent;
}

describe("ClubGuestAgent", () => {
	it("is an agent an application can inject as itself", () => {
		expect(new ClubGuestAgent()).toBeInstanceOf(AdkAgent);
	});

	/** No file and no source: the text is already here, so rendering is the whole of it. */
	it("interpolates its own string with the run it was given", async () => {
		const instructions = await MethodPromptBuilder.forInstance(bound())?.build(CONTEXT);

		expect(instructions?.text).toContain("a silver member earns one point per real spent");
		expect(instructions?.text).toContain("s-42");
	});
});
