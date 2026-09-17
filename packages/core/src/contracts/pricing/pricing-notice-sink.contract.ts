import type { ModelUnpriced } from "../../domain/cost/model-unpriced.value-object";
import { NoticeSink } from "../notice/notice-sink.contract";

/**
 * Where the fact that a call could not be priced goes, so that a zero is never mistaken for
 * free: the run still costs whatever it costs at the provider. Like every {@link NoticeSink}
 * it is off the path of a decision. The context is absent for an embedding asked for outside
 * a run.
 */
export abstract class PricingNoticeSink extends NoticeSink<ModelUnpriced> {}
