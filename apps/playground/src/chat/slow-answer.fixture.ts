import {
	LlmModel,
	ModelCapabilities,
	ModelCapability,
	ModelChunk,
	ModelContextWindow,
	ModelDescriptor,
	ModelIdentity,
	type ModelRequest,
	ModelUsage,
} from "@nestjs-adk/core";

const WORDS = 40;

/**
 * A model that answers slowly and stops when the run is aborted.
 *
 * A scripted model answers in one go, so nothing can be cancelled halfway through it. This
 * is the shape of a real provider adapter instead: it checks the signal between chunks and
 * throws when it is aborted, which is what the SDKs behind OpenAI and Gemini do with the
 * `signal` they are handed.
 */
export class SlowAnswer extends LlmModel {
	public words = 0;

	public constructor(private readonly onFirstWord: () => void = () => undefined) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("fixture", "slow"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(_request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		for (let word = 0; word < WORDS; word += 1) {
			if (signal?.aborted === true) throw new Error(String(signal.reason));
			this.words += 1;
			yield ModelChunk.text(`word-${word} `);
			if (word === 0) this.onFirstWord();
			await Promise.resolve();
		}
		yield ModelChunk.usage(ModelUsage.of(10, WORDS));
		yield ModelChunk.finish("stop");
	}

	public get answeredEverything(): boolean {
		return this.words === WORDS;
	}
}
