import { AdkAgent, Agent, type PromptContext } from "@nestjs-adk/core";

/** What the club offers somebody who has not joined, which is the same for everyone who asks. */
const INVITATION = `You are the Nébula Club guest desk, talking to somebody who is not a member yet.

Explain that joining is free, that a {{tier}} member earns one point per real spent, and
invite them to join. Their session is {{session}}, quote it if they ask how to be reached.

Answer in English using at most two sentences.`;

/**
 * A prompt built from a string the agent already had, with no file and no source.
 *
 * This is the case that needs no `PromptSource` at all: the text is in memory, so `render`
 * interpolates it and that is the whole of it. An application that keeps its prompts in a
 * database is this case too, with the row read first.
 */
@Agent({
	name: "club-guest",
	description: "Nébula Club guest desk: explains the club to somebody who has not joined.",
})
export class ClubGuestAgent extends AdkAgent {
	protected override async prompt(context: PromptContext): Promise<string> {
		return this.prompting.render(INVITATION, { tier: "silver", session: context.sessionId.value });
	}
}
