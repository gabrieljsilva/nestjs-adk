import { Injectable } from "@nestjs/common";
import { CatalogService } from "./catalog.service";
import type { Quote } from "./quote";

/** What a number of copies costs, which is the question a quote answers. */
@Injectable()
export class QuoteGameUseCase {
	public constructor(private readonly catalog: CatalogService) {}

	public execute(slug: string, quantity: number): Quote {
		return this.catalog.quote(slug, quantity);
	}
}
