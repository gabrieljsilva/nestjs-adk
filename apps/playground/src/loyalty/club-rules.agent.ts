import { AdkAgent, Agent } from "@nestjs-adk/core";

/**
 * The same rules for everybody, kept in a file instead of in a string literal.
 *
 * Nothing here depends on the run, so the prompt takes no variables at all. It is still a
 * method rather than a decorator, and that is the point of the case: a long instruction
 * belongs in a `.md` a writer can edit without opening a TypeScript file, and the answer is
 * identical for every member, so the whole prefix stays cacheable.
 */
@Agent({
	name: "club-rules",
	description: "Nébula Club rules desk: how points, tiers and expiry work.",
})
export class ClubRulesAgent extends AdkAgent {
	protected override async prompt(): Promise<string | undefined> {
		return this.prompting.renderFromFile("club-rules.md");
	}
}
