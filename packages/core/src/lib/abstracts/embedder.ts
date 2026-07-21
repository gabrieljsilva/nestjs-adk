import { EmbedderNotConfiguredError } from "../errors/runtime.errors";

export interface EmbeddingUsage {
	/** Input tokens — the only thing embedding providers usually bill. 0 when the provider doesn't report it. */
	promptTokens: number;
}

export interface EmbeddingResult {
	/** One vector per input text, same order. */
	embeddings: number[][];
	usage: EmbeddingUsage;
}

/**
 * Embedding contract (engine-agnostic, same mold as SessionStore/AdkEngine).
 * The lib ships NO implementation — bring your own (see the playground's GeminiEmbedder
 * example over @google/genai). Configure it in AdkModule.forRoot({ embedder }) and inject
 * `Embedder` anywhere (production: semantic search, dedup; testing: toBeSemanticallySimilarTo).
 */
export abstract class Embedder {
	private static active?: Embedder;

	/** Set by AdkModule when the configured embedder resolves — lets test matchers reuse the module's model. */
	public static setActive(instance: Embedder | undefined): void {
		Embedder.active = instance;
	}

	/** The module-configured embedder. Throws a setup hint when none is configured. */
	public static getActive(): Embedder {
		if (!Embedder.active) throw new EmbedderNotConfiguredError();
		return Embedder.active;
	}

	public abstract embed(texts: string[]): Promise<EmbeddingResult>;
}
