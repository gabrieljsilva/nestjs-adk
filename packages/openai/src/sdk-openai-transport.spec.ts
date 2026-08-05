import { ModelCallFailedError, RateLimitedFailure, UnavailableFailure } from "@nestjs-adk/core";
import type { ChatCompletionChunk, ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";
import type { OpenAiChatClient } from "./openai-chat-client";
import { OpenAiChatRequest } from "./openai-chat-request";
import { OpenAiClientFactory } from "./openai-client-factory";
import type { OpenAiOptions } from "./openai-options";
import { SdkOpenAiTransport } from "./sdk-openai-transport";

/** Records how the client was configured and what body it was asked to send. */
class RecordingFactory extends OpenAiClientFactory {
	public options?: OpenAiOptions;
	public body?: ChatCompletionCreateParamsStreaming;
	public signal?: AbortSignal;

	public constructor(
		private readonly chunks: ChatCompletionChunk[] = [],
		private readonly failure?: unknown,
	) {
		super();
	}

	public override create(options: OpenAiOptions): OpenAiChatClient {
		this.options = options;
		return {
			chat: {
				completions: {
					create: async (body, init) => {
						this.body = body;
						this.signal = init?.signal;
						if (this.failure !== undefined) throw this.failure;
						return this.stream();
					},
				},
			},
		};
	}

	private async *stream(): AsyncIterable<ChatCompletionChunk> {
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

function chunkOf(content: string, finish: "stop" | null = null): ChatCompletionChunk {
	return {
		id: "c-1",
		object: "chat.completion.chunk",
		created: 0,
		model: "gpt-5",
		choices: [{ index: 0, delta: { content }, finish_reason: finish }],
	};
}

const request = new OpenAiChatRequest("gpt-5", [{ role: "user", content: "hi" }], [], { temperature: 0.2 });

async function collect(stream: AsyncIterable<{ textDelta: string }>): Promise<string[]> {
	const texts: string[] = [];
	for await (const chunk of stream) texts.push(chunk.textDelta);
	return texts;
}

describe("SdkOpenAiTransport", () => {
	it("points the client at a custom baseURL, which is how it reaches a compatible API", () => {
		const factory = new RecordingFactory();

		const transport = new SdkOpenAiTransport({ baseURL: "http://localhost:11434/v1", apiKey: "ollama" }, factory);

		expect(factory.options?.baseURL).toBe("http://localhost:11434/v1");
		expect(factory.options?.apiKey).toBe("ollama");
		expect(transport.baseURL).toBe("http://localhost:11434/v1");
	});

	it("passes organization, headers and timeout to the client", () => {
		const factory = new RecordingFactory();

		new SdkOpenAiTransport(
			{ organization: "org-1", headers: { "HTTP-Referer": "https://app.example" }, timeoutMs: 5000 },
			factory,
		);

		expect(factory.options?.organization).toBe("org-1");
		expect(factory.options?.headers).toEqual({ "HTTP-Referer": "https://app.example" });
		expect(factory.options?.timeoutMs).toBe(5000);
	});

	it("talks to the official endpoint when no baseURL was given", () => {
		const factory = new RecordingFactory();

		expect(new SdkOpenAiTransport({}, factory).baseURL).toBeUndefined();
	});

	it("always streams, and asks for the usage a stream would otherwise omit", async () => {
		const factory = new RecordingFactory([chunkOf("hi", "stop")]);

		await collect(new SdkOpenAiTransport({}, factory).stream(request));

		expect(factory.body?.stream).toBe(true);
		expect(factory.body?.stream_options).toEqual({ include_usage: true });
	});

	it("sends the model, the messages and the generation options", async () => {
		const factory = new RecordingFactory([chunkOf("hi", "stop")]);

		await collect(new SdkOpenAiTransport({}, factory).stream(request));

		expect(factory.body?.model).toBe("gpt-5");
		expect(factory.body?.messages).toEqual([{ role: "user", content: "hi" }]);
		expect(factory.body?.temperature).toBe(0.2);
	});

	it("omits the tools field entirely when there are none", async () => {
		const factory = new RecordingFactory([chunkOf("hi", "stop")]);

		await collect(new SdkOpenAiTransport({}, factory).stream(request));

		expect(factory.body?.tools).toBeUndefined();
	});

	it("sends the tools when there are some", async () => {
		const factory = new RecordingFactory([chunkOf("hi", "stop")]);
		const withTool = new OpenAiChatRequest(
			"gpt-5",
			[{ role: "user", content: "hi" }],
			[{ type: "function", function: { name: "refund", description: "refunds", parameters: {} } }],
		);

		await collect(new SdkOpenAiTransport({}, factory).stream(withTool));

		expect(factory.body?.tools).toHaveLength(1);
	});

	it("forwards the abort signal", async () => {
		const factory = new RecordingFactory([chunkOf("hi", "stop")]);
		const controller = new AbortController();

		await collect(new SdkOpenAiTransport({}, factory).stream(request, controller.signal));

		expect(factory.signal).toBe(controller.signal);
	});

	it("yields the chunks the stream produced", async () => {
		const factory = new RecordingFactory([chunkOf("Reem"), chunkOf("bolso"), chunkOf("", "stop")]);

		const texts = await collect(new SdkOpenAiTransport({}, factory).stream(request));

		expect(texts.filter((text) => text.length > 0)).toEqual(["Reem", "bolso"]);
	});

	it("turns a failure to open the call into a typed model failure", async () => {
		const factory = new RecordingFactory([], new ApiError("slow down", 429));

		const failure = await collect(new SdkOpenAiTransport({}, factory).stream(request)).catch((error) => error);

		expect(failure).toBeInstanceOf(ModelCallFailedError);
		if (!(failure instanceof ModelCallFailedError)) return;
		expect(failure.failure).toBeInstanceOf(RateLimitedFailure);
		expect(failure.model).toBe("gpt-5");
	});

	it("turns a failure in the middle of the stream into a typed model failure", async () => {
		class BreakingFactory extends OpenAiClientFactory {
			public override create(): OpenAiChatClient {
				return {
					chat: {
						completions: {
							create: async () => {
								async function* broken(): AsyncIterable<ChatCompletionChunk> {
									yield chunkOf("part");
									throw new ApiError("overloaded", 503);
								}
								return broken();
							},
						},
					},
				};
			}
		}

		const failure = await collect(new SdkOpenAiTransport({}, new BreakingFactory()).stream(request)).catch(
			(error) => error,
		);

		expect(failure).toBeInstanceOf(ModelCallFailedError);
		if (!(failure instanceof ModelCallFailedError)) return;
		expect(failure.failure).toBeInstanceOf(UnavailableFailure);
	});
});
