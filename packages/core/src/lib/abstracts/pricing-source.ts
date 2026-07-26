import type { ModelPrice } from "../pricing/pricing-types";

/**
 * Price lookup contract (engine-agnostic, same mold as SessionStore/AdkEmbedder).
 * Lookups are SYNCHRONOUS on purpose: they happen inside the agent loop, over a catalog
 * already in memory. Loading and revalidation are asynchronous and live outside the run path.
 */
export abstract class PricingSource {
	private static active?: PricingSource;

	/** Set by AdkModule when pricing is configured — lets AdkEmbedder price itself without extra injection. */
	public static setActive(instance: PricingSource | undefined): void {
		PricingSource.active = instance;
	}

	/** The module-configured source, or undefined when pricing is off. */
	public static getActive(): PricingSource | undefined {
		return PricingSource.active;
	}

	/** Price for a model id, or undefined when it is unknown — an unknown model is never guessed. */
	public abstract priceFor(model: string): ModelPrice | undefined;

	/** When the loaded catalog was fetched (ISO), or undefined while there is no catalog. */
	public abstract asOf(): string | undefined;

	/** Loading lifecycle, for sources that fetch. AdkModule calls it at bootstrap WITHOUT awaiting. */
	public async start(): Promise<void> {
		return;
	}

	public stop(): void {
		return;
	}
}
