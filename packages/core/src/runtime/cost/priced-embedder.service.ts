import type { Embedder } from "../../contracts/model/embedder.contract";
import { PricedEmbedding } from "../../domain/embedding/priced-embedding.value-object";
import type { RunCostReporter } from "./run-cost-reporter.service";

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
