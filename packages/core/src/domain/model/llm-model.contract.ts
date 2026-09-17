import type { ModelDescriptor } from "./descriptor/model-descriptor.value-object";
import type { ModelRequest } from "./model-request.value-object";
import type { ModelChunk } from "./streaming/model-chunk.value-object";
import type { TokenCount } from "./usage/token-count.value-object";

/**
 * The component that turns execution context into the agent's next decision.
 *
 * A model performs inference and nothing else: it builds no prompts, runs no tools,
 * persists nothing and owns no loop, and retry and failover belong to the agent.
 * `countTokens` is implemented only by an adapter that declares `ModelCapability.TOKEN_COUNTING`.
 */
export abstract class LlmModel {
	public abstract descriptor(): ModelDescriptor;

	public abstract generate(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelChunk>;

	public countTokens?(request: ModelRequest): Promise<TokenCount>;
}
