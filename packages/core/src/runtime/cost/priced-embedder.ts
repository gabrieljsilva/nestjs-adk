import type { Embedder } from "../../contracts/embedder";
import { MeteredEmbedder } from "../../contracts/metered-embedder";
import { MeteredEmbedding } from "../../domain/embedding/metered-embedding";
import { PricedEmbedding } from "../../domain/embedding/priced-embedding";
import { ModelIdentity } from "../../domain/model/model-identity";
import { ModelUsage } from "../../domain/model/model-usage";
import type { RunCostReporter } from "./run-cost-reporter";

/** What an embedder nobody could meter is called in a notice, since it has no model identity. */
const UNMETERED_PROVIDER = "embedder";

/**
 * Prices whatever an embedder consumed, when the embedder is one that says.
 *
 * Indexing a corpus is often the larger half of a bill, and it happens outside a run: nothing
 * about an embedding is a turn, so `AgentResult.cost` never sees it. This is where a consumer
 * asks the same question about it, through the same source and the same reporter.
 *
 * An embedder that reports nothing is not estimated. Guessing tokens from characters would put a
 * number in a report that no invoice will match, which is worse than a report that admits it is
 * incomplete: the call lands in `unpriced` with a notice, named after the class that ran.
 */
export class PricedEmbedder {
	public constructor(
		private readonly embedder: Embedder,
		private readonly costs: RunCostReporter,
	) {}

	public async embed(text: string): Promise<PricedEmbedding> {
		const billed = await this.callOf(text);
		return new PricedEmbedding(billed.vector, await this.costs.report([billed.billed]));
	}

	/**
	 * The embedding, with a usage of nothing when the embedder cannot report one.
	 *
	 * A usage of nothing is what the reporter answers `no-usage` to, so an unmetered embedder
	 * reaches the notice sink through the same path a provider that went quiet does.
	 */
	private async callOf(text: string): Promise<MeteredEmbedding> {
		if (this.embedder instanceof MeteredEmbedder) return await this.embedder.embedMetered(text);
		return new MeteredEmbedding(await this.embedder.embed(text), this.identityOf(), ModelUsage.none());
	}

	private identityOf(): ModelIdentity {
		return ModelIdentity.of(UNMETERED_PROVIDER, this.embedder.constructor.name);
	}
}
