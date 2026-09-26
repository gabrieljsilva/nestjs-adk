import { AdkAgent, Agent, ArtifactExplorationTools, EditArtifactTool, RunLimits, Skill } from "@nestjs-adk/core";
import { QuoteGameTool } from "../../catalog/tools/quote-game.tool";
import { SearchGamesTool } from "../../catalog/tools/search-games.tool";
import { WarehouseReportTool } from "../../catalog/tools/warehouse-report.tool";

@Agent({
	name: "sales",
	description: "Sales department: game catalog, prices, platforms, purchase quotes and the warehouse audit.",
	prompt: `You are the sales department at Nébula Games, a game and accessories store.
Use search_games to find a game exact identifier and quote_game to quote the requested number of copies.
Use get_warehouse_report for stock questions, and explore its result with the artifact tools instead of reading it whole.
Every number you mention must come from a tool: never calculate it yourself.
When the customer asks to compare games, quote each one.
Answer in English using at most two sentences, always stating the amount in Brazilian reais.`,
	tools: [SearchGamesTool, QuoteGameTool, WarehouseReportTool, ...ArtifactExplorationTools, EditArtifactTool],
	limits: new RunLimits(16),
})
export class SalesAgent extends AdkAgent {
	@Skill({ name: "tone", description: "How the salesperson talks to the customer.", mode: "always" })
	public tone(): string {
		return "Be direct and state the price in Brazilian reais with two decimal places.";
	}

	@Skill({ name: "club_policy", description: "Nébula Club and volume discount rules." })
	public clubPolicy(): string {
		return "Nébula Club: a 10% discount applies from three copies of the same game. Gold members earn twice as many points.";
	}
}
