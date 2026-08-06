import { beforeEach, describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { Game } from "./game";
import { GameRepository } from "./game.repository";

const nightreign = Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "acao", 27_990, true);
const silksong = Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true);

let games: GameRepository;

beforeEach(() => {
	games = new GameRepository(new StoreDatabase());
	games.save(nightreign);
	games.save(silksong);
});

describe("GameRepository", () => {
	it("reads back every column it wrote", () => {
		expect(games.findBySlug("elden-ring-nightreign")).toEqual(nightreign);
	});

	it("answers undefined for a title the catalog does not have", () => {
		expect(games.findBySlug("half-life-3")).toBeUndefined();
	});

	it("lists the catalog by title", () => {
		expect(games.all().map((game) => game.title)).toEqual(["Elden Ring Nightreign", "Hollow Knight Silksong"]);
	});

	it("searches by part of the title, ignoring case", () => {
		expect(games.search("SILK").map((game) => game.slug)).toEqual(["hollow-knight-silksong"]);
	});

	it("searches by platform and by genre", () => {
		expect(games.search("ps5").map((game) => game.slug)).toEqual(["elden-ring-nightreign"]);
		expect(games.search("metroidvania").map((game) => game.slug)).toEqual(["hollow-knight-silksong"]);
	});

	it("answers nothing for a term nothing matches", () => {
		expect(games.search("simulador de planilha")).toEqual([]);
	});

	it("keeps the first write when the same title is seeded twice", () => {
		games.save(Game.of("elden-ring-nightreign", "Outro", "pc", "outro", 1, false));

		expect(games.findBySlug("elden-ring-nightreign")?.priceCents).toBe(27_990);
	});
});
