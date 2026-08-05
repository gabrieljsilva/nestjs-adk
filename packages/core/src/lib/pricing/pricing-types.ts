/**
 * Pricing value types: plain data, no runtime behaviour.
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
	/** Context bands in ascending order: the last one matched wins. */
	bands?: PriceBand[];
}

/** Per-model price correction applied over any source. Declared per MILLION tokens, as providers publish it. */
export interface PriceOverride {
	inputPerMTok?: number;
	outputPerMTok?: number;
	cachedPerMTok?: number;
}

/** What a priced call cost, and everything needed to arrive at that number again. */
export interface LlmCost {
	amount: number;
	breakdown: CostBreakdown;
	rates: PriceRates;
}

export interface PricingCatalog {
	/** Serialization format version: migration is the core's responsibility. */
	v: 1;
	entries: Record<string, ModelPrice>;
	/** When this DATA came from the origin (ISO): the real age of the prices. */
	asOf: string;
	/** When it was last confirmed current (ISO). A 304 moves this without touching `asOf`. */
	checkedAt?: string;
	/** Origin validator, used for conditional revalidation. */
	etag?: string;
	source: string;
}

/** The amount split by what was charged for. The three always add up to the amount. */
export interface CostBreakdown {
	/** Prompt tokens the provider billed at full price. */
	input: number;
	output: number;
	/** Prompt tokens served from the provider's cache, at the cache rate. */
	cached: number;
}

export interface CallCost {
	amount: number;
	currency: string;
	breakdown: CostBreakdown;
	/**
	 * Per-token rates applied to THIS call, after bands and overrides. Together with the call's token
	 * counts they let a consumer recompute the amount in its own arithmetic: decimal ledgers should
	 * multiply integers by these rates rather than inherit our floating point.
	 */
	rates: PriceRates;
}

export interface ModelCost {
	model: string;
	/** Number of priced calls to this model in the run. */
	calls: number;
	usage: TokenUsage;
	amount: number;
	/**
	 * The run's amount for this model, split by token kind. No `rates` here on purpose: calls with
	 * different prompt sizes can land in different context bands, so a single rate for the aggregate
	 * would be a fiction. Per-call rates live on `CallCost`.
	 */
	breakdown: CostBreakdown;
}

export interface RunCost {
	total: number;
	currency: string;
	byModel: ModelCost[];
	/** Models used in the run with no price available: their tokens are NOT in `total`. */
	unpriced: string[];
	/** Age of the catalog that produced these numbers (ISO). */
	catalogAsOf?: string;
}
