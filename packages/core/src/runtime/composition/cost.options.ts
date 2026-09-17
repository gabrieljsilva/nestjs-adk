import type { PricingNoticeSink } from "../../contracts/pricing/pricing-notice-sink.contract";
import type { PricingSource } from "../../contracts/pricing/pricing-source.contract";

/** The fields a caller may name; one left out keeps whatever the options already hold. */
export interface CostOptionsPatch {
	pricing?: PricingSource;
	pricingNotices?: PricingNoticeSink;
}

/**
 * Where the price of a model comes from, and where a bill that could not be produced is
 * reported. One source for the whole runtime, with no per agent or per model override.
 *
 * Nothing here can fail a run: without a source every run answers a cost of zero, and an
 * unpriced model is named in the result and sent to the notice sink.
 */
export class CostOptions {
	public constructor(
		public readonly pricing?: PricingSource,
		public readonly pricingNotices?: PricingNoticeSink,
	) {}

	public static from(patch: CostOptionsPatch): CostOptions {
		return new CostOptions().with(patch);
	}

	public with(patch: CostOptionsPatch): CostOptions {
		return new CostOptions(patch.pricing ?? this.pricing, patch.pricingNotices ?? this.pricingNotices);
	}
}
