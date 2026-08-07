import type { Clock } from "../../common/time/clock";
import type { Instant } from "../../common/time/instant";
import { SystemClock } from "../../common/time/system-clock";
import { PricingSource } from "../../contracts/pricing-source";
import type { ModelPrice } from "../../domain/cost/model-price";
import type { ModelIdentity } from "../../domain/model/model-identity";
import { CatalogTransport } from "./catalog-transport";
import { HttpCatalogTransport } from "./http-catalog-transport";
import { LiteLlmCatalogProjection } from "./lite-llm-catalog-projection";

const DEFAULT_TTL_MILLIS = 24 * 60 * 60 * 1000;

/** After a failed read, how long before another one is allowed. Short, so a blip is not a day. */
const DEFAULT_RETRY_MILLIS = 60_000;

export interface LiteLlmPricingOptions {
	/** Where the table is read from. Replace it to vendor the file or to test without the network. */
	transport?: CatalogTransport;
	clock?: Clock;
	/** How long a loaded table is served before being read again. */
	ttlMillis?: number;
	/** How long to wait after a failed read before trying again. */
	retryMillis?: number;
}

/**
 * Prices from the table LiteLLM maintains.
 *
 * The table is read once and served from memory until the TTL passes, because it is 1.6 MB and a
 * price does not change during a day. It is read when the first run asks for a price rather than
 * at boot, so an application that never prices anything never downloads anything.
 *
 * Reading it can fail, and none of the ways it fails reaches a run. An unreachable catalog keeps
 * whatever table was already loaded; a payload that is not a catalog is refused whole, for the
 * same reason; a single unreadable row is dropped and the rest of the table still prices. When
 * there is nothing loaded at all, every model comes back unpriced and the notice sink is what
 * says so.
 *
 * A failed read is not retried on the next question. Without that, a catalog that is down would
 * be requested once per run, which is how a degraded report turns into a load problem.
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
	/** One read at a time: two runs finishing together must not download the table twice. */
	private reading?: Promise<void>;

	public constructor(options: LiteLlmPricingOptions = {}) {
		super();
		this.transport = options.transport ?? new HttpCatalogTransport();
		this.clock = options.clock ?? new SystemClock();
		this.ttlMillis = options.ttlMillis ?? DEFAULT_TTL_MILLIS;
		this.retryMillis = options.retryMillis ?? DEFAULT_RETRY_MILLIS;
	}

	public async priceOf(model: ModelIdentity): Promise<ModelPrice | undefined> {
		await this.refreshIfDue();
		const catalog = this.catalog;
		if (catalog === undefined) return undefined;

		for (const key of this.keysFor(model)) {
			const price = catalog.get(key);
			if (price !== undefined) return price;
		}
		return undefined;
	}

	/**
	 * Where a descriptor is looked up, most specific first.
	 *
	 * The provider qualified key is tried before the bare model name, and the order is the point:
	 * `vertex_ai/gemini-2.5-flash` and `gemini/gemini-2.5-flash` are two entries with different
	 * rates, so a run on Vertex must not be priced at the AI Studio rate just because the bare name
	 * also exists. The bare name is the fallback, and it is also what makes a model whose descriptor
	 * already carries a prefix resolve without the core knowing a single provider name.
	 */
	private keysFor(model: ModelIdentity): readonly string[] {
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

	/** Never rejects: a report is not worth a conversation, so a failure just leaves the table alone. */
	private async read(): Promise<void> {
		try {
			this.catalog = this.projection.project(await this.transport.read());
			this.loadedAt = this.clock.now();
			this.failedAt = undefined;
		} catch {
			// Whatever was already loaded keeps pricing, and nothing loaded keeps answering unpriced.
			this.failedAt = this.clock.now();
		}
	}
}
