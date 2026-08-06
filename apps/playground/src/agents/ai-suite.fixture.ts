import { type LlmModel, MediaPart, Similarity } from "@nestjs-adk/core";
import { GeminiEmbedder, GeminiModel } from "@nestjs-adk/google";
import { OpenAiModel } from "@nestjs-adk/openai";
import { AdkTestBedBuilder, ApiKeyGate, LlmJudge, RunTranscript, TestImage } from "@nestjs-adk/testing";
import { storeBed, storeBedOn } from "../testing/store-bed.fixture";

/**
 * What the suites that spend money share.
 *
 * They boot the real store, the one in `AppModule`, and put a provider behind it. That is
 * the point of them: everything else in this repository proves the runtime against fakes,
 * and what a fake cannot answer is whether a real model, given the prompts and the tools
 * this application declares, does the thing the application was built around.
 *
 * So every case is the smallest question with one right answer, the cheapest model and a
 * low output ceiling. A suite that costs real money has to earn every call it makes.
 *
 * The store runs on OpenAI here. Gemini is kept for the cases that compare two providers,
 * and for the embedder behind them: the shared Gemini tier answered 429
 * `RESOURCE_EXHAUSTED` under load often enough to make a red suite mean nothing.
 */
const GEMINI = "gemini-3.5-flash-lite";
const OPENAI = "gpt-5.6-luna";
const EMBEDDER = "gemini-embedding-2";

/** Long enough for a per minute quota to refill between questions. */
const PACE_MILLIS = 2000;

/** Enough for two sentences or one tool call, and not enough for the model to ramble. */
const MAX_OUTPUT_TOKENS = 256;

/**
 * The least thinking Gemini will accept, because these questions have one right answer.
 *
 * On the 3.5 line it is `thinkingLevel` and not `thinkingBudget`: measured against the raw
 * SDK, `thinkingBudget: 0` is a 400 with `INVALID_ARGUMENT`, and `thinkingLevel: "low"`
 * answers with zero thought tokens. The whole suite failed on this before it was a call
 * anybody could read, so the model options live here and nowhere else.
 */
const LOW_THINKING = { thinkingConfig: { thinkingLevel: "low" } };

/**
 * Reasoning off, and it is not an optimization.
 *
 * Measured: `gpt-5.6-luna` on `/v1/chat/completions` answers 400 to any request that
 * declares function tools while a reasoning effort is in play, and says so: "use
 * /v1/responses or set reasoning_effort to 'none'". Every agent in this store has tools,
 * so without this nothing runs.
 */
const NO_REASONING = { reasoning_effort: "none" };

/** A red square somebody else is hosting, which is what an upload leaves behind. */
export const HOSTED_RED = "https://placehold.co/240x240/ff0000/ff0000.png";

/** The key the store runs on. Without it there is nothing for these suites to prove. */
export const storeGate = ApiKeyGate.fromEnv(["OPEN_AI_API_KEY", "OPENAI_API_KEY"], environment());

/** The second provider, for the cases that ask whether both answer the same thing. */
export const geminiGate = ApiKeyGate.fromEnv(["GEMINI_API_KEY", "GOOGLE_GENAI_API_KEY"], environment());

/** A red square as bytes, built here rather than downloaded. */
export function redSquare(): MediaPart {
	const image = TestImage.red();
	return MediaPart.image(image.mediaType, image.toBase64());
}

/**
 * A pause between questions, because the quota is per minute.
 *
 * These suites run one file at a time on one key, and a case is several calls. Without a
 * breath between them the provider answers 429 and the suite fails for a reason that has
 * nothing to do with the code under test.
 */
export function breathe(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, PACE_MILLIS));
}

/** What the store runs on in these suites, and what a case means by "the model". */
export function storeModel(): LlmModel {
	return new OpenAiModel(OPENAI, {
		apiKey: storeGate.keyOrFail(),
		maxOutputTokens: MAX_OUTPUT_TOKENS,
		body: NO_REASONING,
	});
}

/** The other provider, for the one case that asks whether both answer the same thing. */
export function geminiModel(): LlmModel {
	return new GeminiModel(GEMINI, {
		apiKey: geminiGate.keyOrFail(),
		maxOutputTokens: MAX_OUTPUT_TOKENS,
		temperature: 0,
		config: LOW_THINKING,
	});
}

/** One opinion on whether an answer says what it had to say, for assertions a string cannot make. */
export function judge(): LlmJudge {
	return new LlmJudge(storeModel());
}

/** Real vectors, because two models never write the same sentence and the meaning is the assertion. */
export function embedder(): GeminiEmbedder {
	return new GeminiEmbedder(EMBEDDER, { apiKey: geminiGate.keyOrFail() });
}

export async function closenessOf(first: string, second: string): Promise<number> {
	const vectors = embedder();
	return new Similarity().cosine(await vectors.embed(first), await vectors.embed(second));
}

/**
 * The store with a provider behind every agent, and a transcript.
 *
 * The transcript prints as the run happens, because a paid suite that only says pass or
 * fail hides the thing it was run to see: what the model actually answered, and which
 * tools it reached for on the way.
 */
export function aiStore(location?: string): AdkTestBedBuilder {
	return storeBedOn(storeModel(), location === undefined ? {} : { location }).withConsumers(new RunTranscript());
}

/** The store with the models decided one agent at a time, for a run that mixes real and scripted. */
export function mixedStore(): AdkTestBedBuilder {
	return storeBed().withConsumers(new RunTranscript());
}

/** The environment, with the repository's own `.env` loaded first when there is one. */
function environment(): Record<string, string | undefined> {
	try {
		process.loadEnvFile(new URL("../../../../.env", import.meta.url).pathname);
	} catch {
		// no .env file: the process environment is the only source
	}
	return process.env;
}
