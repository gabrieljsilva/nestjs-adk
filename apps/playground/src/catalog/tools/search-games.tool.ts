import { AdkTool, Tool } from "@nestjs-adk/core";
import { z } from "zod";
import { SearchGamesUseCase } from "../search-games.use-case";

const schema = z.object({
	term: z
		.string()
		.describe("Part of the title, platform (ps5, xbox, switch, pc), or genre. Empty lists the entire store."),
});

@Tool({
	name: "search_games",
	description: "Lists store games matching a term, including platform and genre.",
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
