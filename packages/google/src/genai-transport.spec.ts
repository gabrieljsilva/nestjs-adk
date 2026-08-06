import type { CountTokensParameters, CountTokensResponse, GenerateContentParameters } from "@google/genai";
import { ModelCallFailedError, RateLimitedFailure, TokenCount, UnavailableFailure } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import type { GeminiOptions } from "./gemini-options";
import { GeminiRequest } from "./gemini-request";
import type { GeminiResponseChunk } from "./gemini-stream-mapper";
import type { GenAiClient } from "./genai-client";
import { GenAiClientFactory } from "./genai-client-factory";
import { GenAiTransport } from "./genai-transport";

/** Records how the client was configured and what it was asked to send. */
class RecordingFactory extends GenAiClientFactory {
	public options?: GeminiOptions;
	public params?: GenerateContentParameters;
	public counted?: CountTokensParameters;

	public constructor(
		private readonly chunks: GeminiResponseChunk[] = [],
		private readonly failure?: unknown,
		private readonly totalTokens = 0,
	) {
		super();
	}

	public override create(options: GeminiOptions): GenAiClient {
		this.options = options;
		return {
			models: {
				generateContentStream: async (params) => {
					this.params = params;
					if (this.failure !== undefined) throw this.failure;
					return this.stream();
				},
				countTokens: async (params): Promise<CountTokensResponse> => {
					this.counted = params;
					if (this.failure !== undefined) throw this.failure;
					return { totalTokens: this.totalTokens };
				},
			},
		};
	}

	private async *stream(): AsyncIterable<GeminiResponseChunk> {
		for (const chunk of this.chunks) yield chunk;
	}
}

class ApiError extends Error {
	public constructor(
		message: string,
		public readonly status: number,
	) {
		super(message);
	}
}

const request = new GeminiRequest("gemini-2.5-flash", [{ role: "user", parts: [{ text: "hi" }] }], {
	temperature: 0.2,
});

async function collect(stream: AsyncIterable<{ textDelta: string }>): Promise<string[]> {
	const texts: string[] = [];
	for await (const chunk of stream) texts.push(chunk.textDelta);
	return texts;
}

describe("GenAiTransport", () => {
	it("builds a Gemini API client from an api key", () => {
		const factory = new RecordingFactory();

		const transport = new GenAiTransport({ apiKey: "k" }, factory);

		expect(factory.options?.apiKey).toBe("k");
		expect(transport.isVertex).toBe(false);
	});

	it("builds a Vertex AI client from a project and a location", () => {
		const factory = new RecordingFactory();

		const transport = new GenAiTransport({ vertexai: true, project: "acme", location: "us-central1" }, factory);

		expect(factory.options?.project).toBe("acme");
		expect(factory.options?.location).toBe("us-central1");
		expect(transport.isVertex).toBe(true);
	});

	it("sends the model, the contents and the config", async () => {
		const factory = new RecordingFactory([{ candidates: [{ finishReason: "STOP" }] }]);

		await collect(new GenAiTransport({}, factory).stream(request));

		expect(factory.params?.model).toBe("gemini-2.5-flash");
		expect(factory.params?.contents).toEqual([{ role: "user", parts: [{ text: "hi" }] }]);
		expect(factory.params?.config?.temperature).toBe(0.2);
	});

	it("forwards the abort signal through the config", async () => {
		const factory = new RecordingFactory([{ candidates: [{ finishReason: "STOP" }] }]);
		const controller = new AbortController();

		await collect(new GenAiTransport({}, factory).stream(request, controller.signal));

		expect(factory.params?.config?.abortSignal).toBe(controller.signal);
	});

	it("yields the chunks the stream produced", async () => {
		const factory = new RecordingFactory([
			{ candidates: [{ content: { parts: [{ text: "Reem" }] } }] },
			{ candidates: [{ content: { parts: [{ text: "bolso" }] } }] },
			{ candidates: [{ finishReason: "STOP" }] },
		]);

		const texts = await collect(new GenAiTransport({}, factory).stream(request));

		expect(texts.filter((text) => text.length > 0)).toEqual(["Reem", "bolso"]);
	});

	/**
	 * Two calls the model asked for at once, as the provider actually streams them.
	 *
	 * Gemini sends one call per chunk, so an index counted inside a chunk is zero for both:
	 * the executor then assembles them into a single call whose arguments are two JSON
	 * objects stuck together, and the run dies on arguments that are not an object. This
	 * was found against the real provider, on a question that needed two lookups.
	 */
	it("indexes calls across chunks, so parallel calls stay two calls", async () => {
		const factory = new RecordingFactory([
			{ candidates: [{ content: { parts: [{ functionCall: { name: "find_order", args: { orderId: "A-1" } } }] } }] },
			{ candidates: [{ content: { parts: [{ functionCall: { name: "refund_limit", args: { plan: "gold" } } }] } }] },
			{ candidates: [{ finishReason: "STOP" }] },
		]);

		const calls = [];
		for await (const chunk of new GenAiTransport({}, factory).stream(request)) {
			if (chunk.toolCall !== undefined) calls.push(chunk.toolCall);
		}

		expect(calls.map((call) => call.index)).toEqual([0, 1]);
		expect(calls.map((call) => call.toolName)).toEqual(["find_order", "refund_limit"]);
	});

	it("counts tokens through the provider, measured rather than estimated", async () => {
		const factory = new RecordingFactory([], undefined, 123);

		const count = await new GenAiTransport({}, factory).countTokens(request);

		expect(count.tokens).toBe(123);
		expect(count).toBeInstanceOf(TokenCount);
		expect(factory.counted?.model).toBe("gemini-2.5-flash");
	});

	it("turns a failure to open the call into a typed model failure", async () => {
		const factory = new RecordingFactory([], new ApiError("quota exceeded", 429));

		const failure = await collect(new GenAiTransport({}, factory).stream(request)).catch((error) => error);

		expect(failure).toBeInstanceOf(ModelCallFailedError);
		if (!(failure instanceof ModelCallFailedError)) return;
		expect(failure.failure).toBeInstanceOf(RateLimitedFailure);
		expect(failure.model).toBe("gemini-2.5-flash");
	});

	it("turns a failure while counting into a typed model failure", async () => {
		const factory = new RecordingFactory([], new ApiError("overloaded", 503));

		const failure = await new GenAiTransport({}, factory).countTokens(request).catch((error) => error);

		expect(failure).toBeInstanceOf(ModelCallFailedError);
		if (!(failure instanceof ModelCallFailedError)) return;
		expect(failure.failure).toBeInstanceOf(UnavailableFailure);
	});

	it("turns a failure in the middle of the stream into a typed model failure", async () => {
		class BreakingFactory extends GenAiClientFactory {
			public override create(): GenAiClient {
				return {
					models: {
						generateContentStream: async () => {
							async function* broken(): AsyncIterable<GeminiResponseChunk> {
								yield { candidates: [{ content: { parts: [{ text: "part" }] } }] };
								throw new ApiError("model overloaded", 503);
							}
							return broken();
						},
						countTokens: async (): Promise<CountTokensResponse> => ({ totalTokens: 0 }),
					},
				};
			}
		}

		const failure = await collect(new GenAiTransport({}, new BreakingFactory()).stream(request)).catch((error) => error);

		expect(failure).toBeInstanceOf(ModelCallFailedError);
		if (!(failure instanceof ModelCallFailedError)) return;
		expect(failure.failure).toBeInstanceOf(UnavailableFailure);
	});
});
