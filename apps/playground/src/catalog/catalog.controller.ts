import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from "@nestjs/common";
import type { Game } from "./game";
import type { Quote } from "./quote";
import { QuoteGameUseCase } from "./quote-game.use-case";
import { SearchGamesUseCase } from "./search-games.use-case";

/**
 * The catalog over HTTP, for the part of the store that is not a conversation.
 *
 * It holds no rule of its own: every method reads the request, hands it to a use case and
 * answers what came back. The same use cases are what the agent's tools call, so the price
 * a customer reads on the site and the price the agent quotes cannot drift.
 */
@Controller("catalog")
export class CatalogController {
	public constructor(
		private readonly searchGamesUseCase: SearchGamesUseCase,
		private readonly quoteGameUseCase: QuoteGameUseCase,
	) {}

	@Get("games")
	public search(@Query("term", new DefaultValuePipe("")) term: string): readonly Game[] {
		return this.searchGamesUseCase.execute(term);
	}

	@Get("quote")
	public quote(
		@Query("slug") slug: string,
		@Query("quantity", new DefaultValuePipe(1), ParseIntPipe) quantity: number,
	): Quote {
		return this.quoteGameUseCase.execute(slug, quantity);
	}
}
