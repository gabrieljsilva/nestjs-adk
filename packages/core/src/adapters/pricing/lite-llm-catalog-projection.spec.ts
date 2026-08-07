import { describe, expect, it } from "vitest";
import { MalformedCatalogError } from "./errors/malformed-catalog.error";
import { LiteLlmCatalogProjection } from "./lite-llm-catalog-projection";

const projection = new LiteLlmCatalogProjection();

/** Shaped exactly like the published table, down to the field names. */
const CATALOG = {
	"gpt-5.6-luna": {
		litellm_provider: "openai",
		mode: "chat",
		input_cost_per_token: 1e-7,
		output_cost_per_token: 4e-7,
		cache_read_input_token_cost: 2.5e-8,
	},
	"gemini/gemini-3.5-pro": {
		litellm_provider: "gemini",
		mode: "chat",
		input_cost_per_token: 1.25e-6,
		output_cost_per_token: 1e-5,
		input_cost_per_token_above_200k_tokens: 2.5e-6,
		output_cost_per_token_above_200k_tokens: 1.5e-5,
	},
	"text-embedding-3-small": {
		litellm_provider: "openai",
		mode: "embedding",
		input_cost_per_token: 2e-8,
	},
};

describe("LiteLlmCatalogProjection", () => {
	it("reads the rates the table publishes per token", () => {
		const price = projection.project(CATALOG).get("gpt-5.6-luna");

		expect(price?.input.toUsdPerToken()).toBe(1e-7);
		expect(price?.output.toUsdPerToken()).toBe(4e-7);
		expect(price?.cacheRead?.toUsdPerToken()).toBe(2.5e-8);
	});

	it("reads a band per threshold from the suffixed fields", () => {
		const price = projection.project(CATALOG).get("gemini/gemini-3.5-pro");

		expect(price?.bands).toHaveLength(1);
		expect(price?.bands[0]?.aboveTokens).toBe(200_000);
		expect(price?.ratesFor(300_000).input.toUsdPerToken()).toBe(2.5e-6);
		expect(price?.ratesFor(1_000).input.toUsdPerToken()).toBe(1.25e-6);
	});

	/** An embedding answers a vector, so the table omits the output rate instead of publishing zero. */
	it("prices an embedding entry that publishes no output rate", () => {
		const price = projection.project(CATALOG).get("text-embedding-3-small");

		expect(price?.input.toUsdPerToken()).toBe(2e-8);
		expect(price?.output.isZero).toBe(true);
	});

	it("refuses a chat entry that publishes only half a price", () => {
		const prices = projection.project({
			"half-priced": { mode: "chat", input_cost_per_token: 1e-7 },
		});

		expect(prices.has("half-priced")).toBe(false);
	});

	/** A priority or batch tier is a different product, and nobody who did not ask for it should pay it. */
	it("ignores the service tier and per unit fields that are not a standard token rate", () => {
		const price = projection
			.project({
				tiered: {
					mode: "chat",
					input_cost_per_token: 1e-7,
					output_cost_per_token: 4e-7,
					input_cost_per_token_priority: 9e-6,
					input_cost_per_token_batches: 5e-8,
					input_cost_per_token_above_200k_tokens_priority: 9e-6,
					input_cost_per_character_above_128k_tokens: 3e-7,
					input_cost_per_image: 2e-3,
				},
			})
			.get("tiered");

		expect(price?.bands).toEqual([]);
		expect(price?.ratesFor(500_000).input.toUsdPerToken()).toBe(1e-7);
	});

	it("drops an unreadable entry one at a time and keeps the rest of the table", () => {
		const prices = projection.project({
			...CATALOG,
			"priced-in-words": { input_cost_per_token: "one of the values above", output_cost_per_token: 0 },
			"priced-as-nothing": null,
			"priced-as-a-list": [1, 2],
			"priced-negatively": { input_cost_per_token: -1e-7, output_cost_per_token: 4e-7 },
		});

		expect([...prices.keys()]).toEqual(["gpt-5.6-luna", "gemini/gemini-3.5-pro", "text-embedding-3-small"]);
	});

	it("keys entries exactly as published, because model ids are case sensitive", () => {
		const prices = projection.project({
			"anyscale/meta-llama/Llama-2-70b-chat-hf": { input_cost_per_token: 1e-6, output_cost_per_token: 1e-6 },
		});

		expect(prices.has("anyscale/meta-llama/Llama-2-70b-chat-hf")).toBe(true);
		expect(prices.has("anyscale/meta-llama/llama-2-70b-chat-hf")).toBe(false);
	});

	/** The cheapest rate the table publishes, which in nano units would have projected to zero. */
	it("keeps the cheapest published rate off zero", () => {
		const prices = projection.project({ cheap: { input_cost_per_token: 1.3e-10, output_cost_per_token: 1.3e-10 } });

		expect(prices.get("cheap")?.input.picoPerToken).toBe(130n);
	});

	/** A payload that is not a catalog would otherwise replace a working table with an empty one. */
	it.each([
		["an array", [1, 2, 3]],
		["null", null],
		["a string", "<html>404</html>"],
		["a number", 7],
	])("refuses a whole payload that is %s", (_name, payload) => {
		expect(() => projection.project(payload)).toThrow(MalformedCatalogError);
	});

	it("names what it received when it refuses a payload", () => {
		expect(() => projection.project([])).toThrow(/an array/);
		expect(() => projection.project(null)).toThrow(/null/);
	});

	it("projects an empty table into an empty map", () => {
		expect(projection.project({}).size).toBe(0);
	});
});
