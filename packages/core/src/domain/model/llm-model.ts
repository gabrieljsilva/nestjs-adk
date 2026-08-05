import type { ModelChunk } from "./model-chunk";
import type { ModelDescriptor } from "./model-descriptor";
import type { ModelRequest } from "./model-request";
import type { TokenCount } from "./token-count";

/**
 * The component that turns execution context into the agent's next decision.
 *
 * Two operations, and nothing else. A model performs inference: it does not build
 * prompts, execute tools, persist sessions, control HITL or own the loop. Resilience
 * is absent on purpose, since deciding whether to try again, or which model to try
 * instead, needs knowledge of the run that a model does not have.
 *
 * Counting is a third operation only for the providers that actually offer it. Most
 * count tokens after a call and report them as usage, so an adapter asked to count
 * beforehand could only estimate, and an estimate that looks like a measurement is how
 * a budget goes quietly wrong. An adapter that can count declares
 * `ModelCapability.TOKEN_COUNTING` and implements `countTokens`; the runtime asks no
 * one else.
 */
export abstract class LlmModel {
	/** Identity, context window and capabilities, answerable without calling the provider. */
	public abstract descriptor(): ModelDescriptor;

	/** Yields deltas; the executor aggregates them into the final answer. */
	public abstract generate(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelChunk>;

	/** Only implemented behind `ModelCapability.TOKEN_COUNTING`, and always a real count. */
	public countTokens?(request: ModelRequest): Promise<TokenCount>;
}
