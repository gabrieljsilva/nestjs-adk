import type { BaseLlm, BaseLlmConnection, LlmRequest, LlmResponse } from "@google/adk";
import { BaseLlm as AdkBaseLlm } from "@google/adk";
import type { TokenUsage } from "@nestjs-adk/core";

export interface MeteredCall {
	model: string;
	usage: TokenUsage;
}

/**
 * Records the usage of calls the Runner never sees. The compaction summarizer talks to the model
 * directly (LlmSummarizer → generateContentAsync), and its CompactedEvent is dropped by the
 * pipeline, so summarizing a full context window would cost real money and show up nowhere.
 * Only applied where the event stream cannot reach — the main loop already reports itself.
 */
export class MeteredLlm extends AdkBaseLlm {
	public constructor(
		private readonly inner: BaseLlm,
		private readonly sink: MeteredCall[],
		private readonly toUsage: (usage: NonNullable<LlmResponse["usageMetadata"]>) => TokenUsage,
	) {
		super({ model: inner.model });
	}

	public async *generateContentAsync(
		llmRequest: LlmRequest,
		stream?: boolean,
		abortSignal?: AbortSignal,
	): AsyncGenerator<LlmResponse, void> {
		let usage: TokenUsage | undefined;
		for await (const response of this.inner.generateContentAsync(llmRequest, stream, abortSignal)) {
			// last one wins: streaming repeats the counters, cumulative, on every chunk that carries them
			if (response.usageMetadata) usage = this.toUsage(response.usageMetadata);
			yield response;
		}
		if (usage) this.sink.push({ model: this.inner.model, usage });
	}

	public connect(llmRequest: LlmRequest): Promise<BaseLlmConnection> {
		return this.inner.connect(llmRequest);
	}
}
