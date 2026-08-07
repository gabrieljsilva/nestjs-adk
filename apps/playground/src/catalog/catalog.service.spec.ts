import { describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { CatalogService } from "./catalog.service";
import { GameNotFoundError } from "./errors/game-not-found.error";
import { Game } from "./game";
import { GameRepository } from "./game.repository";

describe("CatalogService", () => {
	it("quotes a title the catalog has", () => {
		const games = new GameRepository(new StoreDatabase());
		games.save(Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true));
		games.save(Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true));
		const catalog = new CatalogService(games);

		expect(catalog.quote("elden-ring-nightreign", 1).totalBrl).toBe(279.9);
	});

	it("reads a slug that came in with spaces around it", () => {
		const games = new GameRepository(new StoreDatabase());
		games.save(Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true));
		games.save(Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true));
		const catalog = new CatalogService(games);

		expect(catalog.quote("  elden-ring-nightreign ", 1).slug).toBe("elden-ring-nightreign");
	});

	it("refuses to quote a title the catalog does not have", () => {
		const games = new GameRepository(new StoreDatabase());
		games.save(Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true));
		games.save(Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true));
		const catalog = new CatalogService(games);

		expect(() => catalog.quote("half-life-3", 1)).toThrow(GameNotFoundError);
	});

	it("searches by term", () => {
		const games = new GameRepository(new StoreDatabase());
		games.save(Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true));
		games.save(Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true));
		const catalog = new CatalogService(games);

		expect(catalog.search("switch").map((game) => game.slug)).toEqual(["hollow-knight-silksong"]);
	});

	it("lists the whole shelf when the term is empty", () => {
		const games = new GameRepository(new StoreDatabase());
		games.save(Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true));
		games.save(Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true));
		const catalog = new CatalogService(games);

		expect(catalog.search("  ")).toHaveLength(2);
	});
});
