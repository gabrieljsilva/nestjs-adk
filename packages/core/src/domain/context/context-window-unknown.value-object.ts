import type { ModelIdentity } from "../model/descriptor/model-identity.value-object";

/**
 * A notice that a model never declared a context window.
 *
 * The run continues and nothing is refused: the context is still measured, but no size
 * can be exceeded and the default policy never compacts.
 */
export class ContextWindowUnknown {
	public constructor(public readonly model: ModelIdentity) {}

	public get message(): string {
		return `Model ${this.model.toString()} declares no context window: context is measured but never refused for it.`;
	}
}
