import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id.value-object";
import { Embedder } from "../../contracts/model/embedder.contract";
import { PricingNoticeSink } from "../../contracts/pricing/pricing-notice-sink.contract";
import { PricingSource } from "../../contracts/pricing/pricing-source.contract";
import { ModelPrice } from "../../domain/cost/model-price.value-object";
import type { ModelUnpriced } from "../../domain/cost/model-unpriced.value-object";
import { TokenRate } from "../../domain/cost/token-rate.value-object";
import { EmbeddingVector } from "../../domain/embedding/embedding-vector.value-object";
import { MeteredEmbedding } from "../../domain/embedding/metered-embedding.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import { ModelUsage } from "../../domain/model/usage/model-usage.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { CostCalculator } from "./cost-calculator.service";
import { PricedEmbedder } from "./priced-embedder.service";
import { RunCostReporter } from "./run-cost-reporter.service";

const EMBEDDING_MODEL = ModelIdentity.of("openai", "text-embedding-3-small");
const PRICE = ModelPrice.of(TokenRate.fromUsdPerToken(2e-8), TokenRate.zero());

class KnowsEmbeddings extends PricingSource {
	public async findPrice(_context: SessionContext | undefined, model: ModelIdentity): Promise<ModelPrice | undefined> {
		return model.equals(EMBEDDING_MODEL) ? PRICE : undefined;
	}
}

class CollectedNotices extends PricingNoticeSink {
	public readonly reported: ModelUnpriced[] = [];

	public report(_context: SessionContext | undefined, notice: ModelUnpriced): void {
		this.reported.push(notice);
	}
}

class SilentEmbedder extends Embedder {
	public async embed(text: string): Promise<EmbeddingVector> {
		return EmbeddingVector.of([text.length, 1, 0]);
	}
}

class ReportingEmbedder extends Embedder {
	public async embed(text: string): Promise<EmbeddingVector> {
		return (await this.embedMetered(text)).vector;
	}

	public async embedMetered(text: string): Promise<MeteredEmbedding> {
		return new MeteredEmbedding(EmbeddingVector.of([1, 0, 0]), EMBEDDING_MODEL, ModelUsage.of(text.length, 0));
	}
}

const pricedOn = (embedder: Embedder, notices?: PricingNoticeSink) =>
	new PricedEmbedder(embedder, new RunCostReporter(new CostCalculator(), new KnowsEmbeddings(), notices));

const CTX = SessionContext.fromSessionId(SessionId.from("s-1"));

describe("PricedEmbedder", () => {
	it("prices an embedder that reports what it consumed", async () => {
		const priced = await pricedOn(new ReportingEmbedder()).embed("a thousand tokens");

		expect(priced.cost.total.pico).toBe(340_000n);
		expect(priced.cost.isComplete).toBe(true);
		expect(priced.vector.dimension).toBe(3);
	});

	/** Estimating tokens from characters would put a number in a report no invoice will match. */
	it("guesses nothing for an embedder that reports nothing", async () => {
		const notices = new CollectedNotices();

		const priced = await pricedOn(new SilentEmbedder(), notices).embed("a thousand tokens");

		expect(priced.cost.total.isZero).toBe(true);
		expect(priced.cost.isComplete).toBe(false);
		expect(notices.reported[0]?.reason).toBe("no-usage");
	});

	it("names the class that ran, since an unmetered embedder has no model to name", async () => {
		const notices = new CollectedNotices();

		await pricedOn(new SilentEmbedder(), notices).embed("hello");

		expect(notices.reported[0]?.model.toString()).toBe("embedder/SilentEmbedder");
	});

	it("hands back the vector whether it could be priced or not", async () => {
		const silent = await pricedOn(new SilentEmbedder()).embed("hello");

		expect(silent.vector.values).toEqual([5, 1, 0]);
	});

	/** A metered embedder is still an embedder: a caller that wants the vector alone gets it. */
	it("answers the plain contract with just the vector", async () => {
		expect((await new ReportingEmbedder().embed("hi")).values).toEqual([1, 0, 0]);
	});
});
