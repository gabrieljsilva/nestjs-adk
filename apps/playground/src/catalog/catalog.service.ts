import { Injectable } from "@nestjs/common";
import { GameNotFoundError } from "./errors/game-not-found.error";
import type { Game } from "./game";
import { GameRepository } from "./game.repository";
import { Quote } from "./quote";

/**
 * What the store knows about what it sells.
 *
 * Searching and quoting are separate on purpose: the shelf is public and cheap, and the
 * quote needs a title that exists, which is the one rule here.
 */
@Injectable()
export class CatalogService {
	public constructor(private readonly games: GameRepository) {}

	public search(term: string): readonly Game[] {
		return term.trim() === "" ? this.games.all() : this.games.search(term.trim());
	}

	public quote(slug: string, quantity: number): Quote {
		const game = this.games.findBySlug(slug.trim());
		if (game === undefined) throw new GameNotFoundError(slug);
		return Quote.of(game, quantity);
	}
}
