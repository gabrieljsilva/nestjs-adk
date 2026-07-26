/**
 * Cost formulas and model-name resolution — pure functions, no I/O.
 * Rule that governs everything here: a missing rate means "unknown", never zero.
 */

import type { EmbeddingUsage } from "../abstracts/adk-embedder";
import type { TokenUsage } from "../types/events";
import type { ModelPrice, PriceBand, PriceOverride, PriceRates } from "./pricing-types";

const PER_MILLION = 1_000_000;

/** The LiteLLM catalog publishes every rate in USD. */
export const PRICING_CURRENCY = "USD";

/** Provider prefix in catalog keys — `vertex_ai/gemini-2.5-flash`, `openrouter/openai/gpt-5`. */
function baseNameOf(key: string): string {
	const slash = key.lastIndexOf("/");
	return slash === -1 ? key : key.slice(slash + 1);
}

/**
 * Exact key first. Falling back to provider-prefixed keys is only safe when every candidate
 * agrees on the price: the same base name can cost 8x more on a reseller (`replicate/google/
 * gemini-2.5-flash`) or carry no price at all (`perplexity/...`). Disagreement → unknown.
 */
export function resolveModelPrice(entries: Record<string, ModelPrice>, model: string): ModelPrice | undefined {
	const exact = entries[model];
	if (exact) return exact;

	const wanted = baseNameOf(model);
	let candidate: ModelPrice | undefined;
	let candidateSignature: string | undefined;
	for (const [key, price] of Object.entries(entries)) {
		if (baseNameOf(key) !== wanted) continue;
		const signature = JSON.stringify(price);
		if (candidateSignature === undefined) {
			candidate = price;
			candidateSignature = signature;
			continue;
		}
		if (signature !== candidateSignature) return undefined;
	}
	return candidate;
}

/** Overrides complement the catalog field by field — a contract discount on input keeps the catalog's output. */
export function applyOverride(
	price: ModelPrice | undefined,
	override: PriceOverride | undefined,
): ModelPrice | undefined {
	if (!override) return price;
	const merged: ModelPrice = { ...price };
	const overridden: Array<keyof PriceRates> = [];
	if (override.inputPerMTok !== undefined) {
		merged.input = override.inputPerMTok / PER_MILLION;
		overridden.push("input");
	}
	if (override.outputPerMTok !== undefined) {
		merged.output = override.outputPerMTok / PER_MILLION;
		overridden.push("output");
	}
	if (override.cachedPerMTok !== undefined) {
		merged.cacheRead = override.cachedPerMTok / PER_MILLION;
		overridden.push("cacheRead");
	}

	// a negotiated price holds above the context thresholds too — otherwise a long prompt would
	// silently fall back to the catalog's public rate for that band
	if (merged.bands && overridden.length > 0) {
		merged.bands = merged.bands.map((band) => {
			const kept: PriceBand = { ...band };
			for (const rate of overridden) delete kept[rate];
			return kept;
		});
	}
	return merged;
}

/** Highest band whose threshold the prompt exceeded, layered over the base rates. */
function ratesFor(price: ModelPrice, promptTokens: number): PriceRates {
	let rates: PriceRates = price;
	for (const band of price.bands ?? []) {
		if (promptTokens > band.aboveTokens) rates = { ...rates, ...definedRates(band) };
	}
	return rates;
}

function definedRates(rates: PriceRates): PriceRates {
	const defined: PriceRates = {};
	if (rates.input !== undefined) defined.input = rates.input;
	if (rates.output !== undefined) defined.output = rates.output;
	if (rates.cacheRead !== undefined) defined.cacheRead = rates.cacheRead;
	return defined;
}

/**
 * LLM cost. `promptTokens` INCLUDES the cached ones (Gemini reports it that way), so the cached
 * share is discounted from the prompt and billed at the cache rate. With no cache rate published,
 * those tokens stay at the full input rate — which is what the provider charges anyway.
 * Missing input or output rate → undefined: a partial price is not a cheaper price.
 */
export function llmCost(price: ModelPrice | undefined, usage: TokenUsage): number | undefined {
	if (!price) return undefined;
	const rates = ratesFor(price, usage.promptTokens);
	if (rates.input === undefined || rates.output === undefined) return undefined;

	const cached = Math.min(usage.cachedTokens ?? 0, usage.promptTokens);
	const fresh = usage.promptTokens - cached;
	return fresh * rates.input + cached * (rates.cacheRead ?? rates.input) + usage.outputTokens * rates.output;
}

/** Embedding cost — input only. Of the catalog's 124 embedding entries, 123 publish zero output cost. */
export function embeddingCost(price: ModelPrice | undefined, usage: EmbeddingUsage | undefined): number | undefined {
	if (!price || price.input === undefined || usage?.promptTokens === undefined) return undefined;
	return usage.promptTokens * price.input;
}
