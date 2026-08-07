import { beforeEach, describe, expect, it } from "vitest";
import { ModelIdentity } from "../../domain/model/model-identity";
import { FakeClock } from "../../support/fake-clock";
import { CatalogTransport } from "./catalog-transport";
import { CatalogUnreachableError } from "./errors/catalog-unreachable.error";
import { LiteLLMPricingSource } from "./lite-llm-pricing-source";

const CATALOG = {
	"gpt-5.6-luna": { mode: "chat", input_cost_per_token: 1e-7, output_cost_per_token: 4e-7 },
	"gemini/gemini-3.5-flash-lite": { mode: "chat", input_cost_per_token: 1e-8, output_cost_per_token: 4e-8 },
	"vertex_ai/gemini-3.5-flash-lite": { mode: "chat", input_cost_per_token: 9e-8, output_cost_per_token: 9e-8 },
	"openrouter/anthropic/claude-4.5-sonnet": { mode: "chat", input_cost_per_token: 3e-6, output_cost_per_token: 1.5e-5 },
};

class FakeTransport extends CatalogTransport {
	public reads = 0;
	public answer: unknown = CATALOG;
	public failure?: Error;

	public async read(): Promise<unknown> {
		this.reads += 1;
		if (this.failure !== undefined) throw this.failure;
		return this.answer;
	}
}

const A_DAY = 24 * 60 * 60 * 1000;

describe("LiteLLMPricingSource", () => {
	let transport: FakeTransport;
	let clock: FakeClock;
	let source: LiteLLMPricingSource;

	beforeEach(() => {
		transport = new FakeTransport();
		clock = new FakeClock();
		source = new LiteLLMPricingSource({ transport, clock, ttlMillis: A_DAY });
	});

	it("prices a bare model name the way the table keys it", async () => {
		const price = await source.priceOf(ModelIdentity.of("openai", "gpt-5.6-luna"));

		expect(price?.input.toUsdPerToken()).toBe(1e-7);
	});

	/** Two entries share the bare name at different rates, so the qualified key has to win. */
	it("prefers the provider qualified key over the bare model name", async () => {
		const vertex = await source.priceOf(ModelIdentity.of("vertex_ai", "gemini-3.5-flash-lite"));
		const studio = await source.priceOf(ModelIdentity.of("gemini", "gemini-3.5-flash-lite"));

		expect(vertex?.input.toUsdPerToken()).toBe(9e-8);
		expect(studio?.input.toUsdPerToken()).toBe(1e-8);
	});

	/** The core knows no provider names: a descriptor that already carries its prefix resolves too. */
	it.each([
		["vertex_ai/gemini-3.5-flash-lite", 9e-8],
		["openrouter/anthropic/claude-4.5-sonnet", 3e-6],
	])("resolves the prefixed descriptor %s", async (model, expected) => {
		const price = await source.priceOf(ModelIdentity.of("whatever", model));

		expect(price?.input.toUsdPerToken()).toBe(expected);
	});

	it("does not know a model the table does not list", async () => {
		expect(await source.priceOf(ModelIdentity.of("openai", "gpt-9-imaginary"))).toBeUndefined();
	});

	it("reads the table once and serves the rest from memory inside the TTL", async () => {
		await source.priceOf(ModelIdentity.of("openai", "gpt-5.6-luna"));
		clock.advance(A_DAY - 1);
		await source.priceOf(ModelIdentity.of("openai", "gpt-5.6-luna"));

		expect(transport.reads).toBe(1);
	});

	it("reads it again once the TTL has passed", async () => {
		await source.priceOf(ModelIdentity.of("openai", "gpt-5.6-luna"));
		clock.advance(A_DAY);
		await source.priceOf(ModelIdentity.of("openai", "gpt-5.6-luna"));

		expect(transport.reads).toBe(2);
	});

	it("reads it once when two runs ask at the same time", async () => {
		const luna = ModelIdentity.of("openai", "gpt-5.6-luna");

		await Promise.all([source.priceOf(luna), source.priceOf(luna), source.priceOf(luna)]);

		expect(transport.reads).toBe(1);
	});

	it("keeps the table it already loaded when a later read fails", async () => {
		await source.priceOf(ModelIdentity.of("openai", "gpt-5.6-luna"));
		transport.failure = new CatalogUnreachableError("https://example.test/catalog.json", 503);
		clock.advance(A_DAY);

		const price = await source.priceOf(ModelIdentity.of("openai", "gpt-5.6-luna"));

		expect(transport.reads).toBe(2);
		expect(price?.input.toUsdPerToken()).toBe(1e-7);
	});

	/** A payload that is not a catalog is refused whole, so the working table survives it. */
	it("keeps the table it already loaded when a later read answers something else", async () => {
		await source.priceOf(ModelIdentity.of("openai", "gpt-5.6-luna"));
		transport.answer = "<html>404</html>";
		clock.advance(A_DAY);

		expect((await source.priceOf(ModelIdentity.of("openai", "gpt-5.6-luna")))?.input.toUsdPerToken()).toBe(1e-7);
	});

	it("answers no price at all when the first read fails, without throwing", async () => {
		transport.failure = new CatalogUnreachableError("https://example.test/catalog.json");

		expect(await source.priceOf(ModelIdentity.of("openai", "gpt-5.6-luna"))).toBeUndefined();
	});

	/** A catalog that is down must not be requested once per run: that turns a bad report into load. */
	it("does not retry a failed read on the next question", async () => {
		transport.failure = new CatalogUnreachableError("https://example.test/catalog.json");
		const luna = ModelIdentity.of("openai", "gpt-5.6-luna");

		await source.priceOf(luna);
		await source.priceOf(luna);
		await source.priceOf(luna);

		expect(transport.reads).toBe(1);
	});

	it("tries again once the retry window has passed", async () => {
		source = new LiteLLMPricingSource({ transport, clock, ttlMillis: A_DAY, retryMillis: 60_000 });
		transport.failure = new CatalogUnreachableError("https://example.test/catalog.json");
		const luna = ModelIdentity.of("openai", "gpt-5.6-luna");

		await source.priceOf(luna);
		clock.advance(60_000);
		transport.failure = undefined;

		expect((await source.priceOf(luna))?.input.toUsdPerToken()).toBe(1e-7);
		expect(transport.reads).toBe(2);
	});

	it("reads nothing before somebody asks for a price", () => {
		expect(transport.reads).toBe(0);
	});
});
