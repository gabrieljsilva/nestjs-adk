import type { BaseLlm, BaseLlmConnection, LlmRequest, LlmResponse } from "@google/adk";
import { BaseLlm as AdkBaseLlm } from "@google/adk";

/**
 * Applies a spec's effective GenerateContentConfig at the model boundary, so the
 * config survives positions where LlmAgent.generateContentConfig does not reach
 * (RoutedLlm targets, compaction summarizer). Merge rule: DEFINED request values win —
 * on the direct path (agent-level config already applied) this is an idempotent no-op;
 * spec labels layer UNDER run labels, preserving mergeLabelsCallback precedence.
 * The incoming request is never mutated: router failover retries the next target
 * with the original request, not one contaminated by the failed target's config.
 */
export class ConfiguredLlm extends AdkBaseLlm {
	public constructor(
		private readonly inner: BaseLlm,
		private readonly specConfig: Record<string, unknown>,
	) {
		super({ model: inner.model });
	}

	public async *generateContentAsync(
		llmRequest: LlmRequest,
		stream?: boolean,
		abortSignal?: AbortSignal,
	): AsyncGenerator<LlmResponse, void> {
		yield* this.inner.generateContentAsync(this.withSpecConfig(llmRequest), stream, abortSignal);
	}

	public connect(llmRequest: LlmRequest): Promise<BaseLlmConnection> {
		return this.inner.connect(this.withSpecConfig(llmRequest));
	}

	private withSpecConfig(llmRequest: LlmRequest): LlmRequest {
		const requestConfig: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(llmRequest.config ?? {})) {
			if (value !== undefined) requestConfig[key] = value;
		}
		const specLabels = this.specConfig.labels as Record<string, string> | undefined;
		const requestLabels = requestConfig.labels as Record<string, string> | undefined;

		const config = {
			...this.specConfig,
			...requestConfig,
			...(specLabels || requestLabels ? { labels: { ...specLabels, ...requestLabels } } : {}),
		} as LlmRequest["config"];

		return { ...llmRequest, config };
	}
}
