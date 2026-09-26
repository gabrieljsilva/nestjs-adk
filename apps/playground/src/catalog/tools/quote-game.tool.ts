import { AdkTool, Tool } from "@nestjs-adk/core";
import { z } from "zod";
import { GameNotFoundError } from "../errors/game-not-found.error";
import { QuoteGameUseCase } from "../quote-game.use-case";

const schema = z.object({
	slug: z.string().describe("Exact game identifier as returned by search_games."),
	quantity: z.number().int().min(1).default(1).describe("How many copies the customer wants."),
});

@Tool({
	name: "quote_game",
	description: "Quotes a game in Brazilian reais with the discount for three or more copies already applied.",
	effect: "read",
	schema,
})
export class QuoteGameTool extends AdkTool<typeof schema> {
	public constructor(private readonly quoteGameUseCase: QuoteGameUseCase) {
		super();
	}

	public execute(input: z.infer<typeof schema>): unknown {
		try {
			const quote = this.quoteGameUseCase.execute(input.slug, input.quantity);
			return {
				slug: quote.slug,
				title: quote.title,
				quantity: quote.quantity,
				unitPriceBrl: quote.unitPriceBrl,
				discountBrl: quote.discountBrl,
				totalBrl: quote.totalBrl,
			};
		} catch (error) {
			if (error instanceof GameNotFoundError) return { error: error.message };
			throw error;
		}
	}
}
