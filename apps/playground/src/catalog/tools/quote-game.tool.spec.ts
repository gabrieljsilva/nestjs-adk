import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { StoreDatabase } from "../../shared/store-database";
import { StoreSeed } from "../../shared/store-seed";
import { QuoteGameTool } from "./quote-game.tool";

describe("QuoteGameTool", () => {
	it("quotes one copy at the shelf price", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.compile();
		module.get(StoreSeed).apply();
		const tool = module.get(QuoteGameTool);
		expect(tool.execute({ slug: "elden-ring-nightreign", quantity: 1 })).toEqual({
			slug: "elden-ring-nightreign",
			title: "Elden Ring Nightreign",
			quantity: 1,
			unitPriceBrl: 279.9,
			discountBrl: 0,
			totalBrl: 279.9,
		});
	});

	it("applies the discount the store publishes", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.compile();
		module.get(StoreSeed).apply();
		const tool = module.get(QuoteGameTool);
		const quote = tool.execute({ slug: "elden-ring-nightreign", quantity: 3 });

		expect(Reflect.get(Object(quote), "discountBrl")).toBe(83.97);
		expect(Reflect.get(Object(quote), "totalBrl")).toBe(755.73);
	});

	it("tells the run the title is wrong instead of failing it", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.compile();
		module.get(StoreSeed).apply();
		const tool = module.get(QuoteGameTool);
		const answer = tool.execute({ slug: "half-life-3", quantity: 1 });

		expect(Reflect.get(Object(answer), "error")).toContain("half-life-3");
	});
});
