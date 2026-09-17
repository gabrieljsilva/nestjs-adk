import type { ModelUnpriced } from "../../domain/cost/model-unpriced";
import type { SessionContext } from "../../domain/run/session-context";

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
 *
 * The context is the conversation the call was made in. It is absent for exactly one caller:
 * an embedding asked for outside a run, which has a model and a usage but no conversation to
 * name. Everything a run does carries one.
 */
export abstract class PricingNoticeSink {
	public abstract report(context: SessionContext | undefined, notice: ModelUnpriced): void;
}
