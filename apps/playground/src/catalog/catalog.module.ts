import { Module } from "@nestjs/common";
import { SharedModule } from "../shared/shared.module";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { GameRepository } from "./game.repository";
import { QuoteGameUseCase } from "./quote-game.use-case";
import { SearchGamesUseCase } from "./search-games.use-case";
import { QuoteGameTool } from "./tools/quote-game.tool";
import { SearchGamesTool } from "./tools/search-games.tool";
import { WarehouseReportTool } from "./tools/warehouse-report.tool";

@Module({
	imports: [SharedModule],
	controllers: [CatalogController],
	providers: [
		CatalogService,
		GameRepository,
		QuoteGameUseCase,
		SearchGamesUseCase,
		QuoteGameTool,
		SearchGamesTool,
		WarehouseReportTool,
	],
	exports: [GameRepository, QuoteGameTool, SearchGamesTool, WarehouseReportTool],
})
export class CatalogModule {}
