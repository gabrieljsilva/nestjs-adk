import type { PricingNoticeSink } from "../../contracts/pricing/pricing-notice-sink.contract";
import type { PricingSource } from "../../contracts/pricing/pricing-source.contract";

/** The fields a caller may name; one left out keeps whatever the options already hold. */
export interface CostOptionsPatch {
	/** One source for the whole runtime. Without it every run answers a cost of zero and says so. */
	pricing?: PricingSource;
	pricingNotices?: PricingNoticeSink;
}

/**
 * What a run costs, and where a bill that could not be produced is reported.
 *
 * There is one source for the whole module and deliberately no per agent or per model
 * override, because a bill that can be overridden in three places is a bill nobody can
 * explain. Nothing here can fail a run: an unpriced model is named in the result and
 * reported to the sink.
 */
export class CostOptions {
	public constructor(
		public readonly pricing?: PricingSource,
		public readonly pricingNotices?: PricingNoticeSink,
	) {}

	/** Options built from names instead of positions, with the same defaults as declaring none. */
	public static from(patch: CostOptionsPatch): CostOptions {
		return new CostOptions().with(patch);
	}

	/** A copy with the named fields replaced and every other field kept. */
	public with(patch: CostOptionsPatch): CostOptions {
		return new CostOptions(patch.pricing ?? this.pricing, patch.pricingNotices ?? this.pricingNotices);
	}
}
