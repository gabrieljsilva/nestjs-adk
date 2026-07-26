import { Injectable } from "@nestjs/common";
import { PricingStorage } from "../abstracts/pricing-storage";
import type { PricingCatalog } from "../pricing/pricing-types";

/** Default storage: lives and dies with the process, so every restart refetches the catalog. */
@Injectable()
export class InMemoryPricingStorage extends PricingStorage {
	private catalog?: PricingCatalog;

	public async read(): Promise<PricingCatalog | undefined> {
		return this.catalog;
	}

	public async write(catalog: PricingCatalog): Promise<void> {
		this.catalog = catalog;
	}
}
