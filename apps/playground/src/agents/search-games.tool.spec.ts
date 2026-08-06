import { beforeEach, describe, expect, it } from "vitest";
import { CatalogService } from "../catalog/catalog.service";
import { GameRepository } from "../catalog/game.repository";
import { SearchGamesUseCase } from "../catalog/search-games.use-case";
import { SearchGamesTool } from "./search-games.tool";
import { seededStore } from "./tool-suite.fixture";

let tool: SearchGamesTool;

beforeEach(() => {
	const games = new GameRepository(seededStore());
	tool = new SearchGamesTool(new SearchGamesUseCase(new CatalogService(games)));
});

describe("SearchGamesTool", () => {
	it("answers the titles that match, with what a customer chooses by", () => {
		expect(tool.execute({ term: "silksong" })).toEqual({
			games: [
				{
					slug: "hollow-knight-silksong",
					title: "Hollow Knight Silksong",
					platform: "switch",
					genre: "metroidvania",
					isDigital: true,
				},
			],
		});
	});

	it("answers the whole shelf for an empty term", () => {
		expect(Reflect.get(Object(tool.execute({ term: "" })), "games")).toHaveLength(6);
	});

	it("answers an empty list instead of failing when nothing matches", () => {
		expect(tool.execute({ term: "simulador de planilha" })).toEqual({ games: [] });
	});

	it("never answers a price, because a price depends on how many copies", () => {
		const answer = JSON.stringify(tool.execute({ term: "ps5" })).toLowerCase();

		expect(answer).not.toContain("price");
		expect(answer).not.toContain("brl");
	});
});
