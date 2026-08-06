import { beforeEach, describe, expect, it } from "vitest";
import { CatalogService } from "../catalog/catalog.service";
import { GameRepository } from "../catalog/game.repository";
import { QuoteGameUseCase } from "../catalog/quote-game.use-case";
import { QuoteGameTool } from "./quote-game.tool";
import { seededStore } from "./tool-suite.fixture";

let tool: QuoteGameTool;

beforeEach(() => {
	const games = new GameRepository(seededStore());
	tool = new QuoteGameTool(new QuoteGameUseCase(new CatalogService(games)));
});

describe("QuoteGameTool", () => {
	it("quotes one copy at the shelf price", () => {
		expect(tool.execute({ slug: "elden-ring-nightreign", quantity: 1 })).toEqual({
			slug: "elden-ring-nightreign",
			title: "Elden Ring Nightreign",
			quantity: 1,
			unitPriceBrl: 279.9,
			discountBrl: 0,
			totalBrl: 279.9,
		});
	});

	it("applies the discount the store publishes", () => {
		const quote = tool.execute({ slug: "elden-ring-nightreign", quantity: 3 });

		expect(Reflect.get(Object(quote), "discountBrl")).toBe(83.97);
		expect(Reflect.get(Object(quote), "totalBrl")).toBe(755.73);
	});

	it("tells the run the title is wrong instead of failing it", () => {
		const answer = tool.execute({ slug: "half-life-3", quantity: 1 });

		expect(Reflect.get(Object(answer), "error")).toContain("half-life-3");
	});
});
