import { Logger } from "@nestjs/common";
import { EMBEDDER_METADATA } from "../constants";
import { EmbedderNotConfiguredError } from "../errors/runtime.errors";
import { PRICING_CURRENCY, embeddingCost } from "../pricing/cost-calculator";
import type { CallCost } from "../pricing/pricing-types";
import { PricingSource } from "./pricing-source";

export interface EmbedderOptions {
	/** Model id — the pricing key, and what shows up in logs. */
	model: string;
	/** Output vector size, when the provider lets you choose it. */
	dimensions?: number;
}

export interface EmbeddingUsage {
	/** Input tokens — the only thing embedding providers bill. Absent when the provider does not report it. */
	promptTokens?: number;
}

/** What a concrete embedder produces: vectors plus whatever the provider reported about consumption. */
export interface EmbeddingOutput {
	/** One vector per input text, same order. */
	embeddings: number[][];
	usage: EmbeddingUsage;
}

export interface EmbeddingResult extends EmbeddingOutput {
	/** Absent when the model has no price or the provider reported no tokens. */
	cost?: CallCost;
}

/**
 * Embedding contract — the @Agent/AdkAgent pair applied to embeddings. The model id is declared
 * on the decorator, not buried inside the call, which is what makes the call priceable.
 * The lib ships NO implementation: write `generate()` over the provider you prefer and the
 * base class handles pricing. Configure it in AdkModule.forRoot({ embedder }).
 */
export abstract class AdkEmbedder {
	private static active?: AdkEmbedder;
	private static readonly logger = new Logger("Adk:embedder");
	private warnedMissingOptions = false;

	/** Set by AdkModule when the configured embedder resolves — lets test matchers reuse the module's model. */
	public static setActive(instance: AdkEmbedder | undefined): void {
		AdkEmbedder.active = instance;
	}

	/** The module-configured embedder. Throws a setup hint when none is configured. */
	public static getActive(): AdkEmbedder {
		if (!AdkEmbedder.active) throw new EmbedderNotConfiguredError();
		return AdkEmbedder.active;
	}

	/** The provider call — vectors and reported tokens, nothing else. */
	protected abstract generate(texts: string[]): Promise<EmbeddingOutput>;

	/** Declared via @Embedder. */
	public get options(): EmbedderOptions | undefined {
		return Reflect.getMetadata(EMBEDDER_METADATA, this.constructor) as EmbedderOptions | undefined;
	}

	public get model(): string | undefined {
		return this.options?.model;
	}

	public get dimensions(): number | undefined {
		return this.options?.dimensions;
	}

	/** Runs the implementation and prices it. Vectors are returned even when the cost is unknown. */
	public async embed(texts: string[]): Promise<EmbeddingResult> {
		const output = await this.generate(texts);
		const model = this.model;
		if (!model) {
			this.warnMissingOptions();
			return output;
		}

		const amount = embeddingCost(PricingSource.getActive()?.priceFor(model), output.usage);
		return amount === undefined ? output : { ...output, cost: { amount, currency: PRICING_CURRENCY } };
	}

	private warnMissingOptions(): void {
		if (this.warnedMissingOptions) return;
		this.warnedMissingOptions = true;
		AdkEmbedder.logger.warn(
			`${this.constructor.name} has no @Embedder({ model }) — embeddings run normally but are never priced.`,
		);
	}
}
