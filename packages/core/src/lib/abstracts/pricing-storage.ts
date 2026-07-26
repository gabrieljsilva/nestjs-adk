import type { PricingCatalog } from "../pricing/pricing-types";

/**
 * Catalog persistence contract. It does NOT exist to save memory (the whole projected
 * catalog is ~0.33 MB): it exists so a restart does not refetch, so replicas share one
 * fetch, and so an offline boot still has prices. Default: InMemoryPricingStorage.
 */
export abstract class PricingStorage {
	/**
	 * Last catalog written, or undefined when there is none. Failures may throw: the source treats
	 * them as a cache miss and logs them, which a silent `undefined` here would hide.
	 */
	public abstract read(): Promise<PricingCatalog | undefined>;

	public abstract write(catalog: PricingCatalog): Promise<void>;
}
