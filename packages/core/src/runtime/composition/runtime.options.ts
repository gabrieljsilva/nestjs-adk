import { RunLimits } from "../../domain/session/run/run-limits.value-object";
import { ContextOptions, type ContextOptionsPatch } from "./context.options";
import { CostOptions, type CostOptionsPatch } from "./cost.options";
import { LifecycleOptions, type LifecycleOptionsPatch } from "./lifecycle.options";
import { ModelOptions, type ModelOptionsPatch } from "./model.options";
import { ToolingOptions, type ToolingOptionsPatch } from "./tooling.options";

/**
 * The fields a caller may name; one left out keeps whatever the options already hold, and
 * a group named partially keeps the fields of that group it did not mention.
 *
 * There is no way to clear a field through a patch: replacing is naming, clearing is
 * building fresh options.
 */
export interface RuntimeOptionsPatch {
	/** What a model reads: compaction, summarizing, attachments, offloading. */
	context?: ContextOptionsPatch;
	/** What a run costs and where an unpriced model is reported. */
	cost?: CostOptionsPatch;
	/** Which tools a run reaches, who may call them, which of them wait for a person. */
	tools?: ToolingOptionsPatch;
	/** What happens around a run: shutdown, snapshots, consumers, redaction. */
	lifecycle?: LifecycleOptionsPatch;
	/** Which model answers, and what a failed call does before failover. */
	model?: ModelOptionsPatch;
	limits?: RunLimits;
}

/**
 * What the application chose to plug into the runtime, and nothing it must choose.
 *
 * Every port here has a default the runtime can compose without help, so an application
 * that declares none still gets a working runtime. The ones that are absent are absent
 * on purpose: without a summarizer compaction drops instead of summarizing, and without
 * a notice sink an unknown window is simply not reported anywhere.
 *
 * The fields are grouped by the question they answer rather than listed flat, and each
 * group is a value object of its own with its own defaults. The grouping is what the
 * composition reads: a composer is handed the group it needs and cannot reach the rest,
 * which is the same boundary the folders draw, written in a type.
 *
 * ```ts
 * RuntimeOptions.from({
 *   context: { summarizer: new GeminiSummarizer() },
 *   cost: { pricing: new LiteLLMPricingSource() },
 *   tools: { approvals: EffectApprovalPolicy.never() },
 * });
 * ```
 */
export class RuntimeOptions {
	public constructor(
		public readonly context: ContextOptions = new ContextOptions(),
		public readonly cost: CostOptions = new CostOptions(),
		public readonly tools: ToolingOptions = new ToolingOptions(),
		public readonly lifecycle: LifecycleOptions = new LifecycleOptions(),
		public readonly model: ModelOptions = new ModelOptions(),
		/**
		 * Fifty iterations unless the application says otherwise, and `RunLimits.unbounded()`
		 * is how it says so. An agent, and then a call, may narrow or widen it from here.
		 *
		 * It is the one field outside a group, because it is the only one that is not a
		 * component: every other answer here is a class somebody can replace, and this is a
		 * number three levels resolve between them.
		 */
		public readonly limits: RunLimits = RunLimits.byDefault(),
	) {}

	/** Options built from names instead of positions, with the same defaults as declaring none. */
	public static from(patch: RuntimeOptionsPatch): RuntimeOptions {
		return new RuntimeOptions().with(patch);
	}

	/**
	 * A copy with the named fields replaced and every other field kept.
	 *
	 * A group is merged rather than replaced, so naming one field of `context` keeps the five
	 * beside it. A caller that copies positions breaks silently whenever a field is added; a
	 * patch never does.
	 */
	public with(patch: RuntimeOptionsPatch): RuntimeOptions {
		return new RuntimeOptions(
			this.context.with(patch.context ?? {}),
			this.cost.with(patch.cost ?? {}),
			this.tools.with(patch.tools ?? {}),
			this.lifecycle.with(patch.lifecycle ?? {}),
			this.model.with(patch.model ?? {}),
			patch.limits ?? this.limits,
		);
	}
}
