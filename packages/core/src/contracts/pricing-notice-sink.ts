import type { ModelUnpriced } from "../domain/cost/model-unpriced";

/**
 * Where the fact that a call could not be priced goes.
 *
 * It exists so that a zero is never mistaken for free. A run whose model the source does not
 * know still answers, still journals and still costs whatever it costs at the provider: the one
 * thing that changes is that our total is smaller than the invoice, and somebody has to be able
 * to find out.
 *
 * Like every sink here, it is off the path of a decision. Nothing it does, including throwing,
 * changes what the runtime does next.
 */
export abstract class PricingNoticeSink {
	public abstract report(notice: ModelUnpriced): void;
}
