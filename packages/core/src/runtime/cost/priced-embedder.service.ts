import type { Embedder } from "../../contracts/model/embedder.contract";
import { PricedEmbedding } from "../../domain/embedding/priced-embedding.value-object";
import type { RunCostReporter } from "./run-cost-reporter.service";

/**
 * Prices whatever an embedder consumed, when the embedder is one that says.
 *
 * Indexing a corpus is often the larger half of a bill, and it happens outside a run: nothing
 * about an embedding is a turn, so `AgentResult.cost` never sees it. This is where a consumer
 * asks the same question about it, through the same source and the same reporter.
 *
 * An embedder that reports nothing is not estimated. Guessing tokens from characters would put a
 * number in a report that no invoice will match, which is worse than a report that admits it is
 * incomplete: `Embedder.embedMetered` answers a usage of nothing for it, the reporter reads that
 * as `no-usage`, and the call lands in `unpriced` with a notice named after the class that ran.
 */
export class PricedEmbedder {
	public constructor(
		private readonly embedder: Embedder,
		private readonly costs: RunCostReporter,
	) {}

	public async embed(text: string): Promise<PricedEmbedding> {
		const billed = await this.embedder.embedMetered(text);
		return new PricedEmbedding(billed.vector, await this.costs.report(undefined, [billed.billed]));
	}
}
