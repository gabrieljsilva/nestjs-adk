import { describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { CatalogService } from "./catalog.service";
import { GameNotFoundError } from "./errors/game-not-found.error";
import { Game } from "./game";
import { GameRepository } from "./game.repository";
import { QuoteGameUseCase } from "./quote-game.use-case";

describe("QuoteGameUseCase", () => {
	it("quotes the copies it was asked about", () => {
		const games = new GameRepository(new StoreDatabase());
		games.save(Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true));
		const useCase = new QuoteGameUseCase(new CatalogService(games));

		const quote = useCase.execute("elden-ring-nightreign", 3);

		expect(quote.title).toBe("Elden Ring Nightreign");
		expect(quote.totalBrl).toBe(755.73);
	});

	it("passes the catalog's refusal through", () => {
		const games = new GameRepository(new StoreDatabase());
		games.save(Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true));
		const useCase = new QuoteGameUseCase(new CatalogService(games));

		expect(() => useCase.execute("half-life-3", 1)).toThrow(GameNotFoundError);
	});
});
