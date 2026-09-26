import { AdkAgent, Agent } from "@nestjs-adk/core";

@Agent({
	name: "club-rules",
	description: "Nébula Club rules desk: how points, tiers and expiry work.",
})
export class ClubRulesAgent extends AdkAgent {
	protected override async prompt(): Promise<string | undefined> {
		return this.prompting.renderFromFile("club-rules.md");
	}
}
