import { Injectable } from "@nestjs/common";
import { CatalogService } from "./catalog.service";
import type { Game } from "./game";

/** What the store has, for a customer who does not know the exact title. */
@Injectable()
export class SearchGamesUseCase {
	public constructor(private readonly catalog: CatalogService) {}

	public execute(term: string): readonly Game[] {
		return this.catalog.search(term);
	}
}
