import { RunLimits } from "../../domain/session/run/run-limits.value-object";
import { ContextOptions, type ContextOptionsPatch } from "./context.options";
import { CostOptions, type CostOptionsPatch } from "./cost.options";
import { LifecycleOptions, type LifecycleOptionsPatch } from "./lifecycle.options";
import { ModelOptions, type ModelOptionsPatch } from "./model.options";
import { ToolingOptions, type ToolingOptionsPatch } from "./tooling.options";

/** The fields a caller may name; a group named partially keeps the fields of that group it did not mention. */
export interface RuntimeOptionsPatch {
	context?: ContextOptionsPatch;
	cost?: CostOptionsPatch;
	tools?: ToolingOptionsPatch;
	lifecycle?: LifecycleOptionsPatch;
	model?: ModelOptionsPatch;
	limits?: RunLimits;
}

/**
 * What the application plugs into the runtime, grouped by the question each group answers:
 * context, cost, tools, lifecycle, model, plus the run limits every level narrows from.
 *
 * Every field has a default, so a runtime declared with none still works. `from` builds
 * options by name and `with` returns a copy, merging a group instead of replacing it.
 */
export class RuntimeOptions {
	public constructor(
		public readonly context: ContextOptions = new ContextOptions(),
		public readonly cost: CostOptions = new CostOptions(),
		public readonly tools: ToolingOptions = new ToolingOptions(),
		public readonly lifecycle: LifecycleOptions = new LifecycleOptions(),
		public readonly model: ModelOptions = new ModelOptions(),
		public readonly limits: RunLimits = RunLimits.byDefault(),
	) {}

	public static from(patch: RuntimeOptionsPatch): RuntimeOptions {
		return new RuntimeOptions().with(patch);
	}

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
