import type { ModelIdentity } from "../model/model-identity";

/**
 * The runtime met a model that never declared how much it can read.
 *
 * It is a notice and not an error: the run continues, every category is still measured
 * and nothing is refused. What it buys is the difference between degrading and
 * degrading silently, which is the difference between a truncated conversation someone
 * can explain and one nobody can.
 */
export class ContextWindowUnknown {
	public constructor(public readonly model: ModelIdentity) {}

	public get message(): string {
		return `Model ${this.model.toString()} declares no context window: context is measured but never refused for it.`;
	}
}
