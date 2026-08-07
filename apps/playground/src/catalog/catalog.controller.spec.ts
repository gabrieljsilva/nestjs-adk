import { describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { Game } from "./game";
import { GameRepository } from "./game.repository";
import { QuoteGameUseCase } from "./quote-game.use-case";
import { SearchGamesUseCase } from "./search-games.use-case";

describe("CatalogController", () => {
	it("answers the shelf when no term was asked for", () => {
		const games = new GameRepository(new StoreDatabase());
		games.save(Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true));
		games.save(Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true));
		const catalog = new CatalogService(games);
		const controller = new CatalogController(new SearchGamesUseCase(catalog), new QuoteGameUseCase(catalog));

		expect(controller.search("")).toHaveLength(2);
	});

	it("answers the titles that match a term", () => {
		const games = new GameRepository(new StoreDatabase());
		games.save(Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true));
		games.save(Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true));
		const catalog = new CatalogService(games);
		const controller = new CatalogController(new SearchGamesUseCase(catalog), new QuoteGameUseCase(catalog));

		expect(controller.search("ps5").map((game) => game.slug)).toEqual(["elden-ring-nightreign"]);
	});

	it("answers a quote for the copies it was asked about", () => {
		const games = new GameRepository(new StoreDatabase());
		games.save(Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true));
		games.save(Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true));
		const catalog = new CatalogService(games);
		const controller = new CatalogController(new SearchGamesUseCase(catalog), new QuoteGameUseCase(catalog));

		expect(controller.quote("elden-ring-nightreign", 1).totalBrl).toBe(279.9);
	});

	it("quotes one copy when the request did not say how many", () => {
		const games = new GameRepository(new StoreDatabase());
		games.save(Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true));
		games.save(Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true));
		const catalog = new CatalogService(games);
		const controller = new CatalogController(new SearchGamesUseCase(catalog), new QuoteGameUseCase(catalog));

		expect(controller.quote("hollow-knight-silksong", 1).quantity).toBe(1);
	});
});
