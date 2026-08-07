import { AdkAgent, Agent, Skill } from "@nestjs-adk/core";
import { QuoteGameTool } from "../../catalog/tools/quote-game.tool";
import { SearchGamesTool } from "../../catalog/tools/search-games.tool";

/**
 * The sector that sells.
 *
 * Both of its tools are shared classes rather than methods, because the site quotes from
 * the same use cases: the price a customer reads and the price the agent says are the same
 * number by construction.
 */
@Agent({
	name: "sales",
	description: "Sales department: game catalog, prices, platforms, and purchase quotes.",
	prompt: `You are the sales department at Nébula Games, a game and accessories store.
Use search_games to find a game exact identifier and quote_game to quote the requested number of copies.
Every number you mention must come from a tool: never calculate it yourself.
When the customer asks to compare games, quote each one.
Answer in English using at most two sentences, always stating the amount in Brazilian reais.`,
	tools: [SearchGamesTool, QuoteGameTool],
})
export class SalesAgent extends AdkAgent {
	/** Always composed: how the sector answers is not something to look up. */
	@Skill({ name: "tone", description: "How the salesperson talks to the customer.", mode: "always" })
	public tone(): string {
		return "Be direct and state the price in Brazilian reais with two decimal places.";
	}

	/** Loaded only when the subject comes up, so it costs nothing the rest of the time. */
	@Skill({ name: "club_policy", description: "Nébula Club and volume discount rules." })
	public clubPolicy(): string {
		return "Nébula Club: a 10% discount applies from three copies of the same game. Gold members earn twice as many points.";
	}
}
