import type { ModelPrice } from "../domain/cost/model-price";
import type { ModelIdentity } from "../domain/model/model-identity";

/**
 * Where the price of a model comes from.
 *
 * One source is declared for the whole module, and every run prices against it. There is no
 * per agent and no per model override: a bill that can be overridden in three places is a bill
 * nobody can explain, and the cases that want one are better served by a source of your own.
 *
 * Implement it to price from your own contract, your own negotiated rates or your own cache.
 * `@nestjs-adk/core` ships `LiteLLMPricingSource`, which reads the catalog LiteLLM maintains.
 *
 * ```ts
 * export class ContractPricing extends PricingSource {
 *   public async priceOf(model: ModelIdentity): Promise<ModelPrice | undefined> {
 *     const agreed = this.rates[model.model];
 *     if (agreed === undefined) return undefined;
 *     return ModelPrice.of(TokenRate.fromUsdPerToken(agreed.in), TokenRate.fromUsdPerToken(agreed.out));
 *   }
 * }
 * ```
 *
 * Returning `undefined` is a normal answer and not a failure: the model is reported as
 * unpriced, its tokens stay out of the total, and the run carries on. Throwing is also
 * survivable, and is treated the same way, because a bill is never worth a conversation.
 */
export abstract class PricingSource {
	/** The price for this model, or `undefined` when this source does not know it. */
	public abstract priceOf(model: ModelIdentity): Promise<ModelPrice | undefined>;
}
