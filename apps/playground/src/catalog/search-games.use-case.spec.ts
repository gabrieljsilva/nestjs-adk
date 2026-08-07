import { describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { CatalogService } from "./catalog.service";
import { Game } from "./game";
import { GameRepository } from "./game.repository";
import { SearchGamesUseCase } from "./search-games.use-case";

describe("SearchGamesUseCase", () => {
	it("answers the titles that match the term", () => {
		const games = new GameRepository(new StoreDatabase());
		games.save(Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true));
		const useCase = new SearchGamesUseCase(new CatalogService(games));

		expect(useCase.execute("elden").map((game) => game.slug)).toEqual(["elden-ring-nightreign"]);
	});

	it("answers nothing when the shelf has no match", () => {
		const games = new GameRepository(new StoreDatabase());
		games.save(Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true));
		const useCase = new SearchGamesUseCase(new CatalogService(games));

		expect(useCase.execute("half-life")).toEqual([]);
	});
});
