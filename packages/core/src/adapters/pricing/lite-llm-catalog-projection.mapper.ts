import { ModelPrice } from "../../domain/cost/model-price.value-object";
import { PriceBand } from "../../domain/cost/price-band.value-object";
import { TokenRate } from "../../domain/cost/token-rate.value-object";
import { MalformedCatalogError } from "./errors/malformed-catalog.error";

const BAND_FIELDS = {
	input: /^input_cost_per_token_above_(\d+)k_tokens$/,
	output: /^output_cost_per_token_above_(\d+)k_tokens$/,
	cacheRead: /^cache_read_input_token_cost_above_(\d+)k_tokens$/,
} as const;

const TOKENS_PER_K = 1000;

type BandRates = { input?: TokenRate; output?: TokenRate; cacheRead?: TokenRate };

export class LiteLlmCatalogProjection {
	public project(payload: unknown): Map<string, ModelPrice> {
		if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
			throw new MalformedCatalogError(payload === null ? "null" : Array.isArray(payload) ? "an array" : typeof payload);
		}

		const prices = new Map<string, ModelPrice>();
		for (const [key, entry] of Object.entries(payload as Record<string, unknown>)) {
			const price = this.readPrice(entry);
			if (price !== undefined) prices.set(key, price);
		}
		return prices;
	}

	private readPrice(entry: unknown): ModelPrice | undefined {
		if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return undefined;
		const fields = entry as Record<string, unknown>;

		const input = this.readRate(fields.input_cost_per_token);
		if (input === undefined) return undefined;

		const output = this.readRate(fields.output_cost_per_token) ?? this.outputlessRate(fields);
		if (output === undefined) return undefined;

		return new ModelPrice(input, output, {
			cacheRead: this.readRate(fields.cache_read_input_token_cost),
			bands: this.readBands(fields),
		});
	}

	private outputlessRate(fields: Record<string, unknown>): TokenRate | undefined {
		return fields.mode === "embedding" ? TokenRate.zero() : undefined;
	}

	private readRate(value: unknown): TokenRate | undefined {
		if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
		return TokenRate.fromUsdPerToken(value);
	}

	private readBands(fields: Record<string, unknown>): readonly PriceBand[] {
		const byThreshold = new Map<number, BandRates>();

		for (const [field, value] of Object.entries(fields)) {
			for (const [role, pattern] of Object.entries(BAND_FIELDS)) {
				const matched = pattern.exec(field);
				if (matched === null) continue;
				const rate = this.readRate(value);
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
