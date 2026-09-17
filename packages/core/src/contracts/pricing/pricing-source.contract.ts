import type { ModelPrice } from "../../domain/cost/model-price.value-object";
import type { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";

/**
 * Where the price of a model comes from. One source is declared for the whole module and every
 * run prices against it.
 *
 * Returning `undefined` is a normal answer and not a failure: the model is reported as
 * unpriced and the run carries on. Throwing is treated the same way. The context is absent for
 * an embedding asked for outside a run.
 */
export abstract class PricingSource {
	public abstract findPrice(context: SessionContext | undefined, model: ModelIdentity): Promise<ModelPrice | undefined>;
}
