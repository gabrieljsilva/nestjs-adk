import type { Clock } from "../../common/time/clock.contract";
import type { Instant } from "../../common/time/instant.value-object";
import { SystemClock } from "../../common/time/system-clock.adapter";
import { PricingSource } from "../../contracts/pricing/pricing-source.contract";
import type { ModelPrice } from "../../domain/cost/model-price.value-object";
import type { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { CatalogTransport } from "./catalog-transport.contract";
import { HttpCatalogTransport } from "./http-catalog-transport.adapter";
import { LiteLlmCatalogProjection } from "./lite-llm-catalog-projection.mapper";

const DEFAULT_TTL_MILLIS = 24 * 60 * 60 * 1000;

const DEFAULT_RETRY_MILLIS = 60_000;

/** Where the table is read from, how long it is served, and how long to wait after a failed read. */
export interface LiteLlmPricingOptions {
	transport?: CatalogTransport;
	clock?: Clock;
	ttlMillis?: number;
	retryMillis?: number;
}

/**
 * Prices from the table LiteLLM maintains, read when the first run asks for a price and served
 * from memory for a day. A provider qualified key wins over the bare model name, so a run on
 * Vertex is not priced at the AI Studio rate.
 *
 * No way it fails reaches a run: a model stays unpriced and the notice sink says so. A failed
 * read is not retried on the next question.
 */
export class LiteLLMPricingSource extends PricingSource {
	private readonly transport: CatalogTransport;
	private readonly clock: Clock;
	private readonly ttlMillis: number;
	private readonly retryMillis: number;
	private readonly projection = new LiteLlmCatalogProjection();

	private catalog?: Map<string, ModelPrice>;
	private loadedAt?: Instant;
	private failedAt?: Instant;
	private reading?: Promise<void>;

	public constructor(options: LiteLlmPricingOptions = {}) {
		super();
		this.transport = options.transport ?? new HttpCatalogTransport();
		this.clock = options.clock ?? new SystemClock();
		this.ttlMillis = options.ttlMillis ?? DEFAULT_TTL_MILLIS;
		this.retryMillis = options.retryMillis ?? DEFAULT_RETRY_MILLIS;
	}

	public async findPrice(_context: SessionContext | undefined, model: ModelIdentity): Promise<ModelPrice | undefined> {
		await this.refreshIfDue();
		const catalog = this.catalog;
		if (catalog === undefined) return undefined;

		for (const key of this.buildKeys(model)) {
			const price = catalog.get(key);
			if (price !== undefined) return price;
		}
		return undefined;
	}

	private buildKeys(model: ModelIdentity): readonly string[] {
		const qualified = `${model.provider}/${model.model}`;
		return qualified === model.model ? [model.model] : [qualified, model.model];
	}

	private async refreshIfDue(): Promise<void> {
		if (!this.isDue(this.clock.now())) return;
		this.reading ??= this.read().finally(() => {
			this.reading = undefined;
		});
		await this.reading;
	}

	private isDue(now: Instant): boolean {
		if (this.failedAt !== undefined && now.epoch - this.failedAt.epoch < this.retryMillis) return false;
		if (this.loadedAt === undefined) return true;
		return now.epoch - this.loadedAt.epoch >= this.ttlMillis;
	}

	private async read(): Promise<void> {
		try {
			this.catalog = this.projection.project(await this.transport.read());
			this.loadedAt = this.clock.now();
			this.failedAt = undefined;
		} catch {
			this.failedAt = this.clock.now();
		}
	}
}
