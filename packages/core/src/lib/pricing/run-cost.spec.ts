import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEmbedder, type EmbeddingOutput } from "../abstracts/adk-embedder";
import { AdkEngine } from "../abstracts/adk-engine";
import { PricingSource } from "../abstracts/pricing-source";
import { Agent } from "../decorators/agent.decorator";
import { Embedder } from "../decorators/embedder.decorator";
import { AdkModule } from "../module/adk.module";
import { ScriptedEngine, text } from "../testing/scripted-engine";
import type { AgentEvent } from "../types/events";
import type { ModelPrice } from "./pricing-types";

const FLASH: ModelPrice = { input: 3e-7, output: 2.5e-6 };
const EMBEDDING: ModelPrice = { input: 1.5e-7 };

class FakePricingSource extends PricingSource {
	public constructor(private readonly prices: Record<string, ModelPrice> = {}) {
		super();
	}

	public priceFor(model: string): ModelPrice | undefined {
		return this.prices[model];
	}

	public asOf(): string | undefined {
		return "2026-07-25T00:00:00.000Z";
	}
}

@Agent({ name: "priced_agent", description: "Priced.", prompt: "p", model: "gemini-2.5-flash" })
class PricedAgent extends AdkAgent {}

@Agent({ name: "unpriced_agent", description: "Unpriced.", prompt: "p", model: "internal-proxy" })
class UnpricedAgent extends AdkAgent {}

@Embedder({ model: "gemini-embedding-001", dimensions: 3072 })
class PricedEmbedder extends AdkEmbedder {
	public reportTokens = true;

	protected async generate(texts: string[]): Promise<EmbeddingOutput> {
		return {
			embeddings: texts.map(() => [0.1, 0.2]),
			usage: { promptTokens: this.reportTokens ? 5_000 : undefined },
		};
	}
}

class UndeclaredEmbedder extends AdkEmbedder {
	protected async generate(texts: string[]): Promise<EmbeddingOutput> {
		return { embeddings: texts.map(() => [0.1]), usage: { promptTokens: 100 } };
	}
}

@Module({ providers: [PricedAgent, UnpricedAgent, PricedEmbedder] })
class FeatureModule {}

async function bootstrap(pricing?: PricingSource) {
	const app = await Test.createTestingModule({
		imports: [
			AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "test-model", pricing, embedder: PricedEmbedder }),
			FeatureModule,
		],
	}).compile();
	await app.init();
	return app;
}

describe("run cost", () => {
	afterEach(() => {
		PricingSource.setActive(undefined);
		vi.restoreAllMocks();
	});

	it("totals every call of the run and breaks it down by model", async () => {
		const app = await bootstrap(new FakePricingSource({ "gemini-2.5-flash": FLASH }));
		const engine = app.get(AdkEngine) as ScriptedEngine;
		engine.enqueue([
			text("first", { promptTokens: 100, outputTokens: 10, totalTokens: 110 }),
			text("second", { promptTokens: 200, outputTokens: 20, totalTokens: 220 }),
		]);

		const run = await app.get(PricedAgent).ask({ message: "hi" });

		expect(run.cost).toEqual({
			total: 300 * 3e-7 + 30 * 2.5e-6,
			currency: "USD",
			byModel: [
				{
					model: "gemini-2.5-flash",
					calls: 2,
					usage: { promptTokens: 300, outputTokens: 30, totalTokens: 330 },
					amount: 300 * 3e-7 + 30 * 2.5e-6,
					breakdown: { input: 300 * 3e-7, output: 30 * 2.5e-6, cached: 0 },
				},
			],
			unpriced: [],
			catalogAsOf: "2026-07-25T00:00:00.000Z",
		});
		await app.close();
	});

	it("each llm_response carries its own cost and the final event carries the run total", async () => {
		const app = await bootstrap(new FakePricingSource({ "gemini-2.5-flash": FLASH }));
		(app.get(AdkEngine) as ScriptedEngine).enqueue([text("only", { promptTokens: 100, outputTokens: 10 })]);

		const run = await app.get(PricedAgent).ask({ message: "hi" });
		const responses = run.events.filter(
			(event): event is Extract<AgentEvent, { type: "llm_response" }> => event.type === "llm_response",
		);

		expect(responses[0]?.model).toBe("gemini-2.5-flash");
		expect(responses[0]?.cost).toEqual({
			amount: 100 * 3e-7 + 10 * 2.5e-6,
			currency: "USD",
			breakdown: { input: 100 * 3e-7, output: 10 * 2.5e-6, cached: 0 },
			rates: FLASH,
		});
		expect(run.events.find((event) => event.type === "final")?.cost).toBe(run.cost);
		await app.close();
	});

	it("a model with no price is named instead of counted as free", async () => {
		const app = await bootstrap(new FakePricingSource({ "gemini-2.5-flash": FLASH }));
		(app.get(AdkEngine) as ScriptedEngine).enqueue([text("answer")]);

		const run = await app.get(UnpricedAgent).ask({ message: "hi" });

		expect(run.cost).toMatchObject({ total: 0, byModel: [], unpriced: ["internal-proxy"] });
		await app.close();
	});

	it("without pricing configured nothing changes: tokens yes, cost absent", async () => {
		const app = await bootstrap();
		(app.get(AdkEngine) as ScriptedEngine).enqueue([text("answer", { promptTokens: 100, outputTokens: 10 })]);

		const run = await app.get(PricedAgent).ask({ message: "hi" });

		expect(run.usage).toMatchObject({ promptTokens: 100, outputTokens: 10 });
		expect(run.cost).toBeUndefined();
		expect(run.events.every((event) => !("cost" in event) || event.cost === undefined)).toBe(true);
		await app.close();
	});

	it("the run log reports the cost next to the tokens", async () => {
		const lines: string[] = [];
		vi.spyOn(Logger.prototype, "log").mockImplementation((...args: unknown[]) => {
			lines.push(String(args[0]));
		});
		const app = await Test.createTestingModule({
			imports: [
				AdkModule.forRoot({
					engine: ScriptedEngine,
					defaultModel: "test-model",
					logging: "info",
					pricing: new FakePricingSource({ "gemini-2.5-flash": FLASH }),
				}),
				FeatureModule,
			],
		}).compile();
		await app.init();
		(app.get(AdkEngine) as ScriptedEngine).enqueue([text("answer", { promptTokens: 100, outputTokens: 10 })]);

		await app.get(PricedAgent).ask({ message: "hi" });

		expect(lines.find((line) => line.startsWith("run done"))).toContain("cost=0.000055 USD");
		await app.close();
	});
});

describe("AdkEmbedder pricing", () => {
	afterEach(() => {
		PricingSource.setActive(undefined);
		AdkEmbedder.setActive(undefined);
		vi.restoreAllMocks();
	});

	it("prices the call with the model declared on the decorator", async () => {
		const app = await bootstrap(new FakePricingSource({ "gemini-embedding-001": EMBEDDING }));
		const embedder = app.get(PricedEmbedder);

		const result = await embedder.embed(["hello"]);

		expect(embedder.model).toBe("gemini-embedding-001");
		expect(embedder.dimensions).toBe(3072);
		expect(result.embeddings).toHaveLength(1);
		expect(result.cost).toEqual({ amount: 5_000 * 1.5e-7, currency: "USD" });
		await app.close();
	});

	it("a provider that reports no tokens returns vectors without cost", async () => {
		const app = await bootstrap(new FakePricingSource({ "gemini-embedding-001": EMBEDDING }));
		const embedder = app.get(PricedEmbedder);
		embedder.reportTokens = false;

		const result = await embedder.embed(["hello"]);

		expect(result.embeddings).toHaveLength(1);
		expect(result.cost).toBeUndefined();
		await app.close();
	});

	it("without pricing configured the vectors still come back", async () => {
		const app = await bootstrap();

		const result = await app.get(PricedEmbedder).embed(["hello"]);

		expect(result.embeddings).toHaveLength(1);
		expect(result.cost).toBeUndefined();
		await app.close();
	});

	it("an embedder with no @Embedder warns once and goes unpriced", async () => {
		const warnings: string[] = [];
		vi.spyOn(Logger.prototype, "warn").mockImplementation((...args: unknown[]) => {
			warnings.push(String(args[0]));
		});
		PricingSource.setActive(new FakePricingSource({ "gemini-embedding-001": EMBEDDING }));
		const embedder = new UndeclaredEmbedder();

		const first = await embedder.embed(["a"]);
		await embedder.embed(["b"]);

		expect(first.cost).toBeUndefined();
		expect(warnings.filter((line) => line.includes("@Embedder"))).toHaveLength(1);
	});
});
