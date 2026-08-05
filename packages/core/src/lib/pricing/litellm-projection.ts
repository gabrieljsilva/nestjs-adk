/**
 * Projection of the LiteLLM catalog (`model_prices_and_context_window.json`) into PricingCatalog.
 *
 * The raw file is ~1.67 MB / 2983 entries, most of it fields this lib cannot use (`supports_*`,
 * `supported_endpoints`, image/audio/video pricing, `max_tokens`, which the file itself documents
 * as a legacy duplicate). Keeping only token rates for text-capable modes leaves ~2.4k models and
 * ~0.33 MB of heap, so no model is ever dropped: the one created on demand is already here.
 */

import type { ModelPrice, PriceBand, PriceRates, PricingCatalog } from "./pricing-types";

/** Modes that consume or produce text tokens; image/audio/rerank pricing is out of scope. */
const TEXT_MODES = new Set(["chat", "completion", "responses", "embedding"]);

/** Cache WRITE cost is deliberately absent: no provider reports how many tokens were written, so it could never be billed. */
const RATE_KEYS: Array<[keyof PriceRates, string]> = [
	["input", "input_cost_per_token"],
	["output", "output_cost_per_token"],
	["cacheRead", "cache_read_input_token_cost"],
];

/** `input_cost_per_token_above_200k_tokens` → 200_000. Service tiers (_priority/_flex) are not covered yet. */
const BAND_SUFFIX = /_above_(\d+)k_tokens$/;

function rateOf(entry: Record<string, unknown>, key: string): number | undefined {
	const value = entry[key];
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function bandsOf(entry: Record<string, unknown>): PriceBand[] | undefined {
	const byThreshold = new Map<number, PriceBand>();
	for (const [rate, prefix] of RATE_KEYS) {
		for (const key of Object.keys(entry)) {
			if (!key.startsWith(`${prefix}_above_`)) continue;
			const threshold = key.match(BAND_SUFFIX)?.[1];
			if (!threshold) continue;
			const value = rateOf(entry, key);
			if (value === undefined) continue;
			const aboveTokens = Number(threshold) * 1000;
			const band = byThreshold.get(aboveTokens) ?? { aboveTokens };
			band[rate] = value;
			byThreshold.set(aboveTokens, band);
		}
	}
	if (byThreshold.size === 0) return undefined;
	return [...byThreshold.values()].sort((a, b) => a.aboveTokens - b.aboveTokens);
}

function priceOf(entry: Record<string, unknown>): ModelPrice | undefined {
	const price: ModelPrice = {};
	for (const [rate, key] of RATE_KEYS) {
		const value = rateOf(entry, key);
		if (value !== undefined) price[rate] = value;
	}
	// no input rate means the entry says nothing usable about what a call costs
	if (price.input === undefined) return undefined;

	const bands = bandsOf(entry);
	if (bands) price.bands = bands;
	return price;
}

/**
 * Two levels of tolerance: a malformed entry is skipped on its own, while a payload that is not
 * an object (or that yields no usable model) is rejected as a whole so the caller can keep
 * the catalog it already had.
 */
export function projectLiteLlmCatalog(
	payload: unknown,
	meta: { source: string; asOf: string; checkedAt?: string; etag?: string },
): PricingCatalog | undefined {
	if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return undefined;

	// null prototype: model ids come from a remote payload, and "__proto__" as a key would otherwise reach the prototype
	const entries: Record<string, ModelPrice> = Object.create(null);
	for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
		// documentation stub shipped inside the catalog, not a model
		if (key === "sample_spec") continue;
		if (typeof value !== "object" || value === null || Array.isArray(value)) continue;

		const entry = value as Record<string, unknown>;
		if (typeof entry.mode !== "string" || !TEXT_MODES.has(entry.mode)) continue;

		const price = priceOf(entry);
		if (price) entries[key] = price;
	}

	if (Object.keys(entries).length === 0) return undefined;
	return {
		v: 1,
		entries,
		asOf: meta.asOf,
		checkedAt: meta.checkedAt ?? meta.asOf,
		etag: meta.etag,
		source: meta.source,
	};
}
