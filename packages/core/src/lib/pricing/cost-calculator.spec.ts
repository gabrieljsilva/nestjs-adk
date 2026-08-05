import { applyOverride, embeddingCost, llmCost, resolveModelPrice } from "./cost-calculator";
import type { ModelPrice } from "./pricing-types";

const FLASH: ModelPrice = { input: 3e-7, output: 2.5e-6, cacheRead: 3e-8 };
const PRO: ModelPrice = {
	input: 1.25e-6,
	output: 1e-5,
	cacheRead: 1.25e-7,
	bands: [{ aboveTokens: 200_000, input: 2.5e-6, output: 1.5e-5, cacheRead: 2.5e-7 }],
};

describe("resolveModelPrice", () => {
	it("prefers the exact key over any provider-prefixed one", () => {
		const entries = { "gemini-2.5-flash": FLASH, "replicate/google/gemini-2.5-flash": { input: 2.5e-6, output: 2.5e-6 } };

		expect(resolveModelPrice(entries, "gemini-2.5-flash")).toBe(FLASH);
	});

	it("falls back to prefixed keys when every candidate agrees on the price", () => {
		const entries = { "gemini/gemini-2.5-flash": FLASH, "vertex_ai/gemini-2.5-flash": { ...FLASH } };

		expect(resolveModelPrice(entries, "gemini-2.5-flash")).toEqual(FLASH);
	});

	it("gives up when prefixed candidates disagree: a reseller can cost 8x more", () => {
		const entries = {
			"openrouter/google/gemini-2.5-flash": FLASH,
			"replicate/google/gemini-2.5-flash": { input: 2.5e-6, output: 2.5e-6 },
		};

		expect(resolveModelPrice(entries, "gemini-2.5-flash")).toBeUndefined();
	});

	it("unknown model resolves to nothing", () => {
		expect(resolveModelPrice({ "gemini-2.5-flash": FLASH }, "internal-proxy")).toBeUndefined();
	});
});

describe("applyOverride", () => {
	it("prices a model the catalog never heard of", () => {
		expect(applyOverride(undefined, { inputPerMTok: 0.5, outputPerMTok: 1.5 })).toEqual({
			input: 5e-7,
			output: 1.5e-6,
		});
	});

	it("complements the catalog field by field: a discount on input keeps the catalog's output", () => {
		expect(applyOverride(FLASH, { inputPerMTok: 0.24 })).toEqual({ ...FLASH, input: 2.4e-7 });
	});

	it("without an override the catalog price passes through untouched", () => {
		expect(applyOverride(FLASH, undefined)).toBe(FLASH);
	});

	it("a negotiated rate also wins above the context threshold", () => {
		const discounted = applyOverride(PRO, { inputPerMTok: 0.5 });

		expect(discounted?.input).toBe(5e-7);
		// the band no longer carries its own input rate, so the long prompt keeps the negotiated price
		expect(discounted?.bands).toEqual([{ aboveTokens: 200_000, output: 1.5e-5, cacheRead: 2.5e-7 }]);
		expect(llmCost(discounted, { promptTokens: 300_000, outputTokens: 0, totalTokens: 300_000 })?.amount).toBeCloseTo(
			300_000 * 5e-7,
			10,
		);
	});
});

describe("llmCost", () => {
	it("charges prompt and output at the base rates", () => {
		const amount = llmCost(FLASH, { promptTokens: 772, outputTokens: 41, totalTokens: 813 })?.amount;

		expect(amount).toBeCloseTo(772 * 3e-7 + 41 * 2.5e-6, 12);
	});

	it("cached tokens are discounted from the prompt and billed at the cache rate", () => {
		const usage = { promptTokens: 10_000, outputTokens: 100, totalTokens: 10_100, cachedTokens: 8_000 };

		expect(llmCost(FLASH, usage)?.amount).toBeCloseTo(2_000 * 3e-7 + 8_000 * 3e-8 + 100 * 2.5e-6, 12);
	});

	it("without a cache rate the cached tokens stay at the full input rate", () => {
		const noCacheRate: ModelPrice = { input: 3e-7, output: 2.5e-6 };
		const usage = { promptTokens: 1_000, outputTokens: 10, totalTokens: 1_010, cachedTokens: 400 };

		expect(llmCost(noCacheRate, usage)?.amount).toBeCloseTo(1_000 * 3e-7 + 10 * 2.5e-6, 12);
	});

	it("a prompt past the band threshold switches to the band rates", () => {
		const below = llmCost(PRO, { promptTokens: 199_000, outputTokens: 1_000, totalTokens: 200_000 })?.amount;
		const above = llmCost(PRO, { promptTokens: 201_000, outputTokens: 1_000, totalTokens: 202_000 })?.amount;

		expect(below).toBeCloseTo(199_000 * 1.25e-6 + 1_000 * 1e-5, 10);
		expect(above).toBeCloseTo(201_000 * 2.5e-6 + 1_000 * 1.5e-5, 10);
	});

	it("a partial price is not a cheaper price: missing output rate means unknown", () => {
		expect(llmCost({ input: 3e-7 }, { promptTokens: 100, outputTokens: 10, totalTokens: 110 })).toBeUndefined();
	});

	it("no price at all means no cost", () => {
		expect(llmCost(undefined, { promptTokens: 100, outputTokens: 10, totalTokens: 110 })).toBeUndefined();
	});
});

describe("embeddingCost", () => {
	it("bills input tokens only", () => {
		expect(embeddingCost({ input: 1.5e-7 }, { promptTokens: 5_000 })).toBeCloseTo(5_000 * 1.5e-7, 12);
	});

	it("a provider that reports no tokens goes unpriced instead of free", () => {
		expect(embeddingCost({ input: 1.5e-7 }, { promptTokens: undefined })).toBeUndefined();
	});

	it("zero reported tokens is a real zero", () => {
		expect(embeddingCost({ input: 1.5e-7 }, { promptTokens: 0 })).toBe(0);
	});
});
