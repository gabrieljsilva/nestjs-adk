import { ModelPrice } from "../../domain/cost/model-price";
import { PriceBand } from "../../domain/cost/price-band";
import { TokenRate } from "../../domain/cost/token-rate";
import { MalformedCatalogError } from "./errors/malformed-catalog.error";

/** Bands are published one field per threshold, and the suffix is always a `k` count of tokens. */
const BAND_FIELDS = {
	input: /^input_cost_per_token_above_(\d+)k_tokens$/,
	output: /^output_cost_per_token_above_(\d+)k_tokens$/,
	cacheRead: /^cache_read_input_token_cost_above_(\d+)k_tokens$/,
} as const;

const TOKENS_PER_K = 1000;

type BandRates = { input?: TokenRate; output?: TokenRate; cacheRead?: TokenRate };

/**
 * Turns the table LiteLLM publishes into prices, and drops whatever it cannot read.
 *
 * It is separate from the source because these are two different jobs: reading a foreign shape,
 * and deciding when to read it again. Keeping the projection alone makes it testable against a
 * literal, which is the only way to be sure about a table of 2988 entries nobody will review by
 * hand.
 *
 * What it deliberately ignores is as important as what it reads. The table prices images per
 * image, audio per second and characters per character, and it publishes service tiers as
 * suffixed fields (`_priority`, `_flex`, `_batches`). None of those is a per token rate for a
 * standard call, so a field has to match exactly to be used: a regex anchored at both ends is
 * what keeps a priority rate from being charged to somebody who did not ask for priority.
 */
export class LiteLlmCatalogProjection {
	/**
	 * Every entry that yields a usable per token price, keyed exactly as the table keys it.
	 *
	 * Keys are not lowercased, because 300 of them are case sensitive model ids
	 * (`anyscale/meta-llama/Llama-2-70b-chat-hf`), and folding them would make two models
	 * collide on one price.
	 */
	public project(payload: unknown): Map<string, ModelPrice> {
		if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
			throw new MalformedCatalogError(payload === null ? "null" : Array.isArray(payload) ? "an array" : typeof payload);
		}

		const prices = new Map<string, ModelPrice>();
		for (const [key, entry] of Object.entries(payload as Record<string, unknown>)) {
			const price = this.priceOf(entry);
			if (price !== undefined) prices.set(key, price);
		}
		return prices;
	}

	/** One entry, or `undefined` when it says nothing usable about what a token costs. */
	private priceOf(entry: unknown): ModelPrice | undefined {
		if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return undefined;
		const fields = entry as Record<string, unknown>;

		const input = this.rateOf(fields.input_cost_per_token);
		if (input === undefined) return undefined;

		const output = this.rateOf(fields.output_cost_per_token) ?? this.outputlessRate(fields);
		if (output === undefined) return undefined;

		return ModelPrice.of(input, output, {
			cacheRead: this.rateOf(fields.cache_read_input_token_cost),
			bands: this.bandsOf(fields),
		});
	}

	/**
	 * Zero output for the modes that produce no output tokens.
	 *
	 * An embedding answers a vector, so the table often omits its output rate rather than
	 * publishing a zero. Reading that as no price would leave 4 embedding models unpriceable over
	 * a field that could not have applied to them. For a chat entry the same omission stays fatal,
	 * because there the missing half is half the bill.
	 */
	private outputlessRate(fields: Record<string, unknown>): TokenRate | undefined {
		return fields.mode === "embedding" ? TokenRate.zero() : undefined;
	}

	private rateOf(value: unknown): TokenRate | undefined {
		if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
		return TokenRate.fromUsdPerToken(value);
	}

	private bandsOf(fields: Record<string, unknown>): readonly PriceBand[] {
		const byThreshold = new Map<number, BandRates>();

		for (const [field, value] of Object.entries(fields)) {
			for (const [role, pattern] of Object.entries(BAND_FIELDS)) {
				const matched = pattern.exec(field);
				if (matched === null) continue;
				const rate = this.rateOf(value);
				if (rate === undefined) continue;
				const threshold = Number(matched[1]) * TOKENS_PER_K;
				const rates = byThreshold.get(threshold) ?? {};
				rates[role as keyof BandRates] = rate;
				byThreshold.set(threshold, rates);
			}
		}

		return [...byThreshold].map(([threshold, rates]) => PriceBand.above(threshold, rates));
	}
}
