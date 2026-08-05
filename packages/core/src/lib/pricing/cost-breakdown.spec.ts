import { llmCost } from "./cost-calculator";
import type { ModelPrice } from "./pricing-types";

const FLASH: ModelPrice = { input: 3e-7, output: 2.5e-6, cacheRead: 3e-8 };
const PRO: ModelPrice = {
	input: 1.25e-6,
	output: 1e-5,
	cacheRead: 1.25e-7,
	bands: [{ aboveTokens: 200_000, input: 2.5e-6, output: 1.5e-5, cacheRead: 2.5e-7 }],
};

describe("llmCost breakdown", () => {
	it("reports each token kind separately: a billing row needs them as columns", () => {
		const usage = { promptTokens: 10_000, outputTokens: 100, totalTokens: 10_100, cachedTokens: 8_000 };

		const cost = llmCost(FLASH, usage);

		expect(cost?.breakdown).toEqual({
			input: 2_000 * 3e-7,
			cached: 8_000 * 3e-8,
			output: 100 * 2.5e-6,
		});
	});

	it("keeps the parts adding up to the total", () => {
		const usage = { promptTokens: 772, outputTokens: 41, totalTokens: 813 };

		const cost = llmCost(FLASH, usage);

		expect(cost).toBeDefined();
		const { input, output, cached } = (cost as NonNullable<typeof cost>).breakdown;
		expect(input + output + cached).toBeCloseTo((cost as NonNullable<typeof cost>).amount, 15);
	});

	it("exposes the rates it actually applied, so the amount can be recomputed exactly", () => {
		const usage = { promptTokens: 300_000, outputTokens: 500, totalTokens: 300_500, cachedTokens: 100_000 };

		const cost = llmCost(PRO, usage);

		// the band replaced the base rates: billing in Decimal needs the ones that were used, not the catalog's
		expect(cost?.rates).toEqual({ input: 2.5e-6, output: 1.5e-5, cacheRead: 2.5e-7 });
	});

	it("gives enough to rebuild the amount from integers: no float inherited from us", () => {
		const usage = { promptTokens: 10_000, outputTokens: 100, totalTokens: 10_100, cachedTokens: 8_000 };

		const cost = llmCost(FLASH, usage);
		expect(cost).toBeDefined();
		const rates = (cost as NonNullable<typeof cost>).rates;
		const fresh = usage.promptTokens - usage.cachedTokens;

		// tokens are integers and rates are per-token: a Decimal consumer never has to trust our arithmetic
		const rebuilt =
			fresh * (rates.input ?? 0) + usage.cachedTokens * (rates.cacheRead ?? 0) + usage.outputTokens * (rates.output ?? 0);
		expect(rebuilt).toBeCloseTo((cost as NonNullable<typeof cost>).amount, 15);
	});

	it("charges uncached prompt tokens at the input rate when the provider reports no cache", () => {
		const usage = { promptTokens: 1_000, outputTokens: 10, totalTokens: 1_010 };

		const cost = llmCost(FLASH, usage);

		expect(cost?.breakdown.cached).toBe(0);
		expect(cost?.breakdown.input).toBeCloseTo(1_000 * 3e-7, 15);
	});

	it("stays undefined for an unpriced model: an unknown cost is not a zero cost", () => {
		expect(llmCost(undefined, { promptTokens: 10, outputTokens: 1, totalTokens: 11 })).toBeUndefined();
		expect(llmCost({ input: 3e-7 }, { promptTokens: 10, outputTokens: 1, totalTokens: 11 })).toBeUndefined();
	});
});
