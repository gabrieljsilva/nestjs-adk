/**
 * Pricing value types — plain data, no runtime behaviour.
 * Rates are per SINGLE token (the unit the LiteLLM catalog publishes), never per million.
 */

import type { TokenUsage } from "../types/events";

export interface PriceRates {
	/** Cost of one input (prompt) token. */
	input?: number;
	/** Cost of one output token. */
	output?: number;
	/** Cost of one prompt token served from the provider's cache. */
	cacheRead?: number;
}

/** Rates that replace the base ones once the call's prompt exceeds `aboveTokens`. */
export interface PriceBand extends PriceRates {
	aboveTokens: number;
}

export interface ModelPrice extends PriceRates {
	/** Context bands in ascending order — the last one matched wins. */
	bands?: PriceBand[];
}

/** Per-model price correction applied over any source. Declared per MILLION tokens, as providers publish it. */
export interface PriceOverride {
	inputPerMTok?: number;
	outputPerMTok?: number;
	cachedPerMTok?: number;
}

export interface PricingCatalog {
	/** Serialization format version — migration is the core's responsibility. */
	v: 1;
	entries: Record<string, ModelPrice>;
	/** When this DATA came from the origin (ISO) — the real age of the prices. */
	asOf: string;
	/** When it was last confirmed current (ISO). A 304 moves this without touching `asOf`. */
	checkedAt?: string;
	/** Origin validator, used for conditional revalidation. */
	etag?: string;
	source: string;
}

export interface CallCost {
	amount: number;
	currency: string;
}

export interface ModelCost {
	model: string;
	/** Number of priced calls to this model in the run. */
	calls: number;
	usage: TokenUsage;
	amount: number;
}

export interface RunCost {
	total: number;
	currency: string;
	byModel: ModelCost[];
	/** Models used in the run with no price available — their tokens are NOT in `total`. */
	unpriced: string[];
	/** Age of the catalog that produced these numbers (ISO). */
	catalogAsOf?: string;
}
