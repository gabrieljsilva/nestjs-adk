import { AdkAgent, Agent, type PromptContext } from "@nestjs-adk/core";

const INVITATION = `You are the Nébula Club guest desk, talking to somebody who is not a member yet.

Explain that joining is free, that a {{tier}} member earns one point per real spent, and
invite them to join. Their session is {{session}}, quote it if they ask how to be reached.

Answer in English using at most two sentences.`;

@Agent({
	name: "club-guest",
	description: "Nébula Club guest desk: explains the club to somebody who has not joined.",
})
export class ClubGuestAgent extends AdkAgent {
	protected override async prompt(context: PromptContext): Promise<string> {
		return this.prompting.render(INVITATION, { tier: "silver", session: context.sessionId.value });
	}
}
