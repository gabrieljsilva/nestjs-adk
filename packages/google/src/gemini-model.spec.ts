import {
	LlmModel,
	ModelCapability,
	ModelChunk,
	ModelRequest,
	ModelSpec,
	PromptInstructions,
	TokenCount,
	UserMessage,
} from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { GeminiModel } from "./gemini-model";
import type { GeminiRequest } from "./gemini-request";
import { GeminiTransport } from "./gemini-transport";

/** Answers with a script and records what it was asked to send. */
class RecordingTransport extends GeminiTransport {
	public request?: GeminiRequest;
	public signal?: AbortSignal;
	public counted?: GeminiRequest;

	public constructor(private readonly chunks: ModelChunk[] = [ModelChunk.finish("STOP")]) {
		super();
	}

	public async *stream(request: GeminiRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		this.request = request;
		this.signal = signal;
		for (const chunk of this.chunks) yield chunk;
	}

	public async countTokens(request: GeminiRequest): Promise<TokenCount> {
		this.counted = request;
		return TokenCount.measured(42);
	}
}

async function collect(stream: AsyncIterable<ModelChunk>): Promise<ModelChunk[]> {
	const chunks: ModelChunk[] = [];
	for await (const chunk of stream) chunks.push(chunk);
	return chunks;
}

describe("GeminiModel", () => {
	it("is a model spec, and therefore a model", () => {
		const model = new GeminiModel("gemini-2.5-flash", {}, new RecordingTransport());

		expect(model).toBeInstanceOf(ModelSpec);
		expect(model).toBeInstanceOf(LlmModel);
	});

	it("identifies itself by provider and model name", () => {
		const descriptor = new GeminiModel("gemini-2.5-flash", {}, new RecordingTransport()).descriptor();

		expect(descriptor.identity.toString()).toBe("google/gemini-2.5-flash");
	});

	it("identifies itself the same way on Vertex AI, since it is the same model", () => {
		const vertex = new GeminiModel(
			"gemini-2.5-flash",
			{ vertexai: true, project: "acme", location: "us-central1" },
			new RecordingTransport(),
		);

		expect(vertex.descriptor().identity.toString()).toBe("google/gemini-2.5-flash");
	});

	it("declares an unknown window rather than inventing a number", () => {
		const window = new GeminiModel("gemini-2.5-flash", {}, new RecordingTransport()).descriptor().contextWindow;

		expect(window.isKnown).toBe(false);
	});

	it("declares the window the caller stated", () => {
		const model = new GeminiModel(
			"gemini-2.5-flash",
			{ contextWindowTokens: 1_000_000, reservedOutputTokens: 8000 },
			new RecordingTransport(),
		);

		const window = model.descriptor().contextWindow;

		expect(window.isKnown).toBe(true);
		expect(window.inputCapacity).toBe(992_000);
	});

	it("declares tools, streaming, structured output, media and prompt cache", () => {
		const capabilities = new GeminiModel("gemini-2.5-flash", {}, new RecordingTransport()).descriptor().capabilities;

		expect(capabilities.supports(ModelCapability.TOOLS)).toBe(true);
		expect(capabilities.supports(ModelCapability.STREAMING)).toBe(true);
		expect(capabilities.supports(ModelCapability.STRUCTURED_OUTPUT)).toBe(true);
		expect(capabilities.supports(ModelCapability.MEDIA_INPUT)).toBe(true);
		expect(capabilities.supports(ModelCapability.PROMPT_CACHE)).toBe(true);
	});

	it("maps the request before handing it to the transport", async () => {
		const transport = new RecordingTransport();
		const model = new GeminiModel("gemini-2.5-flash", { temperature: 0.2 }, transport);

		await collect(model.generate(new ModelRequest([new UserMessage("hi")], [], PromptInstructions.from("be brief"))));

		expect(transport.request?.contents).toEqual([{ role: "user", parts: [{ text: "hi" }] }]);
		expect(transport.request?.config.systemInstruction).toBe("be brief");
		expect(transport.request?.config.temperature).toBe(0.2);
	});

	it("yields exactly the chunks the transport produced", async () => {
		const transport = new RecordingTransport([
			ModelChunk.text("Reem"),
			ModelChunk.text("bolso"),
			ModelChunk.finish("STOP"),
		]);

		const chunks = await collect(new GeminiModel("gemini-2.5-flash", {}, transport).generate(new ModelRequest([])));

		expect(chunks.map((chunk) => chunk.textDelta)).toEqual(["Reem", "bolso", ""]);
		expect(chunks.at(-1)?.isFinal).toBe(true);
	});

	it("forwards the abort signal to the transport", async () => {
		const transport = new RecordingTransport();
		const controller = new AbortController();

		await collect(new GeminiModel("gemini-2.5-flash", {}, transport).generate(new ModelRequest([]), controller.signal));

		expect(transport.signal).toBe(controller.signal);
	});

	it("counts tokens through the provider, and says the count was measured", async () => {
		const transport = new RecordingTransport();
		const model = new GeminiModel("gemini-2.5-flash", {}, transport);

		const count = await model.countTokens(new ModelRequest([new UserMessage("hi")]));

		expect(count.tokens).toBe(42);
		expect(count).toBeInstanceOf(TokenCount);
		expect(transport.counted?.contents).toEqual([{ role: "user", parts: [{ text: "hi" }] }]);
	});

	it("is recognised as a spec across a package boundary", () => {
		expect(ModelSpec.is(new GeminiModel("gemini-2.5-flash", {}, new RecordingTransport()))).toBe(true);
		expect(ModelSpec.idOf(new GeminiModel("gemini-2.5-flash", {}, new RecordingTransport()))).toBe("gemini-2.5-flash");
	});
});
