import { AdkTool, Tool } from "@nestjs-adk/core";
import { z } from "zod";
import { GameNotFoundError } from "../catalog/errors/game-not-found.error";
import { QuoteGameUseCase } from "../catalog/quote-game.use-case";

const schema = z.object({
	slug: z.string().describe("Identificador exato do jogo, como search_games devolve."),
	quantity: z.number().int().min(1).default(1).describe("Quantas cópias o cliente quer."),
});

/**
 * What a number of copies of one title costs.
 *
 * A title the catalog does not have comes back as an answer rather than as a failure: the
 * run can recover from being told the name is wrong, and cannot recover from a tool that
 * throws. Anything else is left to fail, because a broken database is not something a
 * model should be inventing an answer around.
 */
@Tool({
	name: "quote_game",
	description: "Cota em reais quanto sai um jogo, com o desconto de três cópias ou mais já aplicado.",
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
