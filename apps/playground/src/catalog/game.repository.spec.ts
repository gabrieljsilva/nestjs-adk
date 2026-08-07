import { describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { Game } from "./game";
import { GameRepository } from "./game.repository";

describe("GameRepository", () => {
	it("reads back every column it wrote", () => {
		const nightreign = Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true);
		const silksong = Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true);
		const games = new GameRepository(new StoreDatabase());
		games.save(nightreign);
		games.save(silksong);

		expect(games.findBySlug("elden-ring-nightreign")).toEqual(nightreign);
	});

	it("answers undefined for a title the catalog does not have", () => {
		const nightreign = Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true);
		const silksong = Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true);
		const games = new GameRepository(new StoreDatabase());
		games.save(nightreign);
		games.save(silksong);

		expect(games.findBySlug("half-life-3")).toBeUndefined();
	});

	it("lists the catalog by title", () => {
		const nightreign = Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true);
		const silksong = Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true);
		const games = new GameRepository(new StoreDatabase());
		games.save(nightreign);
		games.save(silksong);

		expect(games.all().map((game) => game.title)).toEqual(["Elden Ring Nightreign", "Hollow Knight Silksong"]);
	});

	it("searches by part of the title, ignoring case", () => {
		const nightreign = Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true);
		const silksong = Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true);
		const games = new GameRepository(new StoreDatabase());
		games.save(nightreign);
		games.save(silksong);

		expect(games.search("SILK").map((game) => game.slug)).toEqual(["hollow-knight-silksong"]);
	});

	it("searches by platform and by genre", () => {
		const nightreign = Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true);
		const silksong = Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true);
		const games = new GameRepository(new StoreDatabase());
		games.save(nightreign);
		games.save(silksong);

		expect(games.search("ps5").map((game) => game.slug)).toEqual(["elden-ring-nightreign"]);
		expect(games.search("metroidvania").map((game) => game.slug)).toEqual(["hollow-knight-silksong"]);
	});

	it("answers nothing for a term nothing matches", () => {
		const nightreign = Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true);
		const silksong = Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true);
		const games = new GameRepository(new StoreDatabase());
		games.save(nightreign);
		games.save(silksong);

		expect(games.search("spreadsheet simulator")).toEqual([]);
	});

	it("keeps the first write when the same title is seeded twice", () => {
		const nightreign = Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true);
		const silksong = Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true);
		const games = new GameRepository(new StoreDatabase());
		games.save(nightreign);
		games.save(silksong);

		games.save(Game.of("elden-ring-nightreign", "Outro", "pc", "outro", 1, false));

		expect(games.findBySlug("elden-ring-nightreign")?.priceCents).toBe(27_990);
	});
});
