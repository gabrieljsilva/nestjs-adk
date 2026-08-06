import { type LlmModel, MediaPart, Similarity } from "@nestjs-adk/core";
import { GeminiEmbedder, GeminiModel } from "@nestjs-adk/google";
import { OpenAiModel } from "@nestjs-adk/openai";
import { LlmJudge, TestImage } from "@nestjs-adk/testing";
import type { TestingModule } from "@nestjs/testing";
import { RecordedEvents } from "../testing/recorded-events.fixture";
import { type StoreBoot, bootStore } from "../testing/store-app.fixture";
import { Transcript } from "../testing/transcript.fixture";

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
 * The store runs on OpenAI here. Gemini is kept for the one case that compares two
 * providers, and for the embedder behind it: the shared Gemini tier answered 429
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

/** A red square somebody else is hosting, which is what an upload leaves behind. */
export const HOSTED_RED = "https://placehold.co/240x240/ff0000/ff0000.png";

/**
 * A red square as bytes, built here rather than downloaded.
 *
 * Sixty four pixels of one colour is the smallest picture with an unambiguous answer, and
 * a single pixel is not it: asked about one, the model answered "rosa".
 */
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

/** What the store is booted with and what watched it happen. */
export interface AiStore {
	app: TestingModule;
	events: RecordedEvents;
}

/** The key the store runs on. Without it there is nothing for these suites to prove. */
export function storeKey(): string | undefined {
	loadEnvironment();
	return process.env.OPEN_AI_API_KEY ?? process.env.OPENAI_API_KEY;
}

export function geminiKey(): string | undefined {
	loadEnvironment();
	return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENAI_API_KEY;
}

/**
 * Reasoning off, and it is not an optimization.
 *
 * Measured: `gpt-5.6-luna` on `/v1/chat/completions` answers 400 to any request that
 * declares function tools while a reasoning effort is in play, and says so: "use
 * /v1/responses or set reasoning_effort to 'none'". Every agent in this store has tools,
 * so without this nothing runs.
 */
const NO_REASONING = { reasoning_effort: "none" };

/** What the store runs on in these suites, and what a case means by "the model". */
export function storeModel(apiKey: string): LlmModel {
	return new OpenAiModel(OPENAI, { apiKey, maxOutputTokens: MAX_OUTPUT_TOKENS, body: NO_REASONING });
}

/** The second provider, for the one case that asks whether both answer the same thing. */
export function geminiModel(apiKey: string): LlmModel {
	return new GeminiModel(GEMINI, { apiKey, maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0, config: LOW_THINKING });
}

/** One opinion on whether an answer says what it had to say, for assertions a string cannot make. */
export function judgeWith(apiKey: string): LlmJudge {
	return new LlmJudge(storeModel(apiKey));
}

/** Real vectors, because two models never write the same sentence and the meaning is the assertion. */
export function embedderWith(apiKey: string): GeminiEmbedder {
	return new GeminiEmbedder(EMBEDDER, { apiKey });
}

export async function closenessOf(
	first: string,
	second: string,
	apiKey: string,
	similarity: Similarity = new Similarity(),
): Promise<number> {
	const embedder = embedderWith(apiKey);
	return similarity.cosine(await embedder.embed(first), await embedder.embed(second));
}

/**
 * The store, with a provider behind it, a recorder and a transcript.
 *
 * The transcript prints as the run happens, because a paid suite that only says pass or
 * fail hides the thing it was run to see: what the model actually answered, and which
 * tools it reached for on the way.
 */
export async function bootAi(model: LlmModel, boot: StoreBoot = {}): Promise<AiStore> {
	const events = new RecordedEvents();
	const app = await bootStore(model, {
		...boot,
		consumers: [events, new Transcript(), ...(boot.consumers ?? [])],
	});
	return { app, events };
}

function loadEnvironment(): void {
	try {
		process.loadEnvFile(new URL("../../../../.env", import.meta.url).pathname);
	} catch {
		// no .env file: the process environment is the only source
	}
}
