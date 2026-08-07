import "reflect-metadata";
import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { Embedder } from "../../contracts/embedder";
import { MeteredEmbedder } from "../../contracts/metered-embedder";
import { PricingSource } from "../../contracts/pricing-source";
import { ModelPrice } from "../../domain/cost/model-price";
import { TokenRate } from "../../domain/cost/token-rate";
import { EmbeddingVector } from "../../domain/embedding/embedding-vector";
import { MeteredEmbedding } from "../../domain/embedding/metered-embedding";
import { ModelIdentity } from "../../domain/model/model-identity";
import { ModelUsage } from "../../domain/model/model-usage";
import { CostCalculator } from "../../runtime/cost/cost-calculator";
import { PricedEmbedder } from "../../runtime/cost/priced-embedder";
import { RunCostReporter } from "../../runtime/cost/run-cost-reporter";
import { FakeClock } from "../../support/fake-clock";
import { RecordingModel } from "../../support/nest/recording-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { AdkModule } from "./adk-module";
import { AdkModuleOptions } from "./adk-module-options";
import { Agent } from "./decorators/agent.decorator";
import { EmbedderNotDeclaredError } from "./errors/embedder-not-declared.error";

const EMBEDDING_MODEL = ModelIdentity.of("acme", "embed-1");

/** Deterministic and dimensionless on purpose: what matters is which one answered. */
class FixedEmbedder extends Embedder {
	public constructor(private readonly signature: number) {
		super();
	}

	public async embed(text: string): Promise<EmbeddingVector> {
		return EmbeddingVector.of([this.signature, text.length]);
	}
}

class ReportingEmbedder extends MeteredEmbedder {
	public async embedMetered(text: string): Promise<MeteredEmbedding> {
		return new MeteredEmbedding(EmbeddingVector.of([1, 0]), EMBEDDING_MODEL, ModelUsage.of(text.length, 0));
	}
}

class KnowsEmbeddings extends PricingSource {
	public async priceOf(model: ModelIdentity): Promise<ModelPrice | undefined> {
		return model.equals(EMBEDDING_MODEL) ? ModelPrice.of(TokenRate.fromUsdPerToken(1e-8), TokenRate.zero()) : undefined;
	}
}

/** A plain application service that only knows the port, which is the whole point of AC-15. */
@Injectable()
class SearchService {
	public constructor(private readonly embedder: Embedder) {}

	public async vectorOf(text: string): Promise<EmbeddingVector> {
		return this.embedder.embed(text);
	}
}

@Agent({ name: "support", description: "Handles orders.", prompt: "Be brief." })
class SupportAgent {}

@Module({ providers: [SupportAgent, SearchService], exports: [SearchService] })
class FeatureModule {}

let app: TestingModule | undefined;

afterEach(async () => {
	await app?.close();
	app = undefined;
});

async function bootWith(embedder?: Embedder): Promise<TestingModule> {
	app = await Test.createTestingModule({
		imports: [
			AdkModule.forRoot(
				AdkModuleOptions.from({
					defaultModel: new RecordingModel(),
					clock: new FakeClock(),
					ids: new SequenceIdGenerator(),
					embedder,
				}),
			),
			FeatureModule,
		],
	}).compile();
	await app.init();
	return app;
}

describe("the embedder the container hands out", () => {
	it("reaches a service that injects the port by type", async () => {
		const booted = await bootWith(new FixedEmbedder(7));

		const vector = await booted.get(SearchService).vectorOf("four");

		expect(vector.values).toEqual([7, 4]);
	});

	it("is the same instance the application declared", async () => {
		const declared = new FixedEmbedder(1);
		const booted = await bootWith(declared);

		expect(booted.get(Embedder)).toBe(declared);
	});

	/** AC-16: an application that never embeds must not be made to declare one. */
	it("boots without one, and only fails when somebody embeds", async () => {
		const booted = await bootWith();

		expect(booted.get(SearchService)).toBeInstanceOf(SearchService);
		await expect(booted.get(SearchService).vectorOf("hi")).rejects.toBeInstanceOf(EmbedderNotDeclaredError);
	});

	it("says which option was missing", async () => {
		const booted = await bootWith();

		await expect(booted.get(Embedder).embed("hi")).rejects.toThrow(/AdkModule.forRoot/);
	});

	/** AC-15: two applications, two embedders, and neither answers for the other. */
	it("keeps two modules with different embedders apart", async () => {
		const first = await bootWith(new FixedEmbedder(1));
		const firstVector = await first.get(SearchService).vectorOf("x");
		await first.close();

		const second = await bootWith(new FixedEmbedder(2));
		const secondVector = await second.get(SearchService).vectorOf("x");

		expect(firstVector.values[0]).toBe(1);
		expect(secondVector.values[0]).toBe(2);
	});

	/** AC-17: an embedder that reports usage is priced through the same source a run uses. */
	it("prices an injected embedder that reports what it consumed", async () => {
		const booted = await bootWith(new ReportingEmbedder());
		const priced = new PricedEmbedder(
			booted.get(Embedder),
			new RunCostReporter(new CostCalculator(), new KnowsEmbeddings()),
		);

		const embedding = await priced.embed("ten chars!");

		expect(embedding.cost.total.pico).toBe(100_000n);
		expect(embedding.cost.isComplete).toBe(true);
	});
});
