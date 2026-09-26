import { Injectable } from "@nestjs/common";
import { GameNotFoundError } from "./errors/game-not-found.error";
import type { Game } from "./game";
import { GameRepository } from "./game.repository";
import { Quote } from "./quote";

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
