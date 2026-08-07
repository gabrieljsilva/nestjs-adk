import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { StoreDatabase } from "../../shared/store-database";
import { StoreSeed } from "../../shared/store-seed";
import { SearchGamesTool } from "./search-games.tool";

describe("SearchGamesTool", () => {
	it("answers the titles that match, with what a customer chooses by", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.compile();
		module.get(StoreSeed).apply();
		const tool = module.get(SearchGamesTool);
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

	it("answers the whole shelf for an empty term", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.compile();
		module.get(StoreSeed).apply();
		const tool = module.get(SearchGamesTool);
		expect(Reflect.get(Object(tool.execute({ term: "" })), "games")).toHaveLength(6);
	});

	it("answers an empty list instead of failing when nothing matches", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.compile();
		module.get(StoreSeed).apply();
		const tool = module.get(SearchGamesTool);
		expect(tool.execute({ term: "spreadsheet simulator" })).toEqual({ games: [] });
	});

	it("never answers a price, because a price depends on how many copies", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.compile();
		module.get(StoreSeed).apply();
		const tool = module.get(SearchGamesTool);
		const answer = JSON.stringify(tool.execute({ term: "ps5" })).toLowerCase();

		expect(answer).not.toContain("price");
		expect(answer).not.toContain("brl");
	});
});
