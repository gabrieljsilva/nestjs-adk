import { AdkTool, Tool } from "@nestjs-adk/core";
import { z } from "zod";
import { SearchGamesUseCase } from "../catalog/search-games.use-case";

const schema = z.object({
	term: z.string().describe("Parte do título, plataforma (ps5, xbox, switch, pc) ou gênero. Vazio lista a loja toda."),
});

/**
 * The shelf, without prices.
 *
 * Prices are deliberately absent: what a customer pays depends on how many copies they
 * want, so the shelf answers what exists and `quote_game` answers what it costs. That also
 * means comparing four titles is four quotes, which is the shape of the question anyway.
 */
@Tool({
	name: "search_games",
	description: "Lista os jogos da loja que casam com um termo, com plataforma e gênero.",
	schema,
	effect: "read",
})
export class SearchGamesTool extends AdkTool<typeof schema> {
	public constructor(private readonly searchGamesUseCase: SearchGamesUseCase) {
		super();
	}

	public execute(input: z.infer<typeof schema>): unknown {
		return {
			games: this.searchGamesUseCase.execute(input.term).map((game) => ({
				slug: game.slug,
				title: game.title,
				platform: game.platform,
				genre: game.genre,
				isDigital: game.isDigital,
			})),
		};
	}
}
