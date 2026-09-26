import { Injectable } from "@nestjs/common";
import { CatalogService } from "./catalog.service";
import type { Quote } from "./quote";

@Injectable()
export class QuoteGameUseCase {
	public constructor(private readonly catalog: CatalogService) {}

	public execute(slug: string, quantity: number): Quote {
		return this.catalog.quote(slug, quantity);
	}
}
