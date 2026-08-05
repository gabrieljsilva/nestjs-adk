import {
	LlmModel,
	ModelCapability,
	ModelChunk,
	ModelRequest,
	ModelSpec,
	PromptInstructions,
	UserMessage,
} from "@nestjs-adk/core/native";
import { describe, expect, it } from "vitest";
import type { OpenAiChatRequest } from "./openai-chat-request";
import { OpenAiModel } from "./openai-model";
import { OpenAiTransport } from "./openai-transport";

/** Answers with a script and records what it was asked to send. */
class RecordingTransport extends OpenAiTransport {
	public request?: OpenAiChatRequest;
	public signal?: AbortSignal;

	public constructor(private readonly chunks: ModelChunk[] = [ModelChunk.finish("stop")]) {
		super();
	}

	public async *stream(request: OpenAiChatRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		this.request = request;
		this.signal = signal;
		for (const chunk of this.chunks) yield chunk;
	}
}

async function collect(stream: AsyncIterable<ModelChunk>): Promise<ModelChunk[]> {
	const chunks: ModelChunk[] = [];
	for await (const chunk of stream) chunks.push(chunk);
	return chunks;
}

describe("OpenAiModel", () => {
	it("is a model spec, and therefore a model", () => {
		const model = new OpenAiModel("gpt-5", {}, new RecordingTransport());

		expect(model).toBeInstanceOf(ModelSpec);
		expect(model).toBeInstanceOf(LlmModel);
	});

	it("identifies itself by provider and model name", () => {
		const descriptor = new OpenAiModel("gpt-5", {}, new RecordingTransport()).descriptor();

		expect(descriptor.identity.provider).toBe("openai");
		expect(descriptor.identity.model).toBe("gpt-5");
		expect(descriptor.identity.toString()).toBe("openai/gpt-5");
	});

	it("declares an unknown window rather than inventing a number", () => {
		const descriptor = new OpenAiModel("gpt-5", {}, new RecordingTransport()).descriptor();

		expect(descriptor.contextWindow.isKnown).toBe(false);
		expect(descriptor.contextWindow.fits(10_000_000)).toBe(true);
	});

	it("declares the window the caller stated", () => {
		const model = new OpenAiModel(
			"gpt-5",
			{ contextWindowTokens: 1000, reservedOutputTokens: 200 },
			new RecordingTransport(),
		);

		const window = model.descriptor().contextWindow;

		expect(window.isKnown).toBe(true);
		expect(window.reservedOutputTokens).toBe(200);
		expect(window.inputCapacity).toBe(800);
	});

	it("reserves the declared output budget when no explicit reservation was made", () => {
		const model = new OpenAiModel("gpt-5", { contextWindowTokens: 1000, maxOutputTokens: 300 }, new RecordingTransport());

		expect(model.descriptor().contextWindow.reservedOutputTokens).toBe(300);
	});

	it("declares tools, streaming, structured output and media", () => {
		const capabilities = new OpenAiModel("gpt-5", {}, new RecordingTransport()).descriptor().capabilities;

		expect(capabilities.supports(ModelCapability.TOOLS)).toBe(true);
		expect(capabilities.supports(ModelCapability.STREAMING)).toBe(true);
		expect(capabilities.supports(ModelCapability.STRUCTURED_OUTPUT)).toBe(true);
		expect(capabilities.supports(ModelCapability.MEDIA_INPUT)).toBe(true);
	});

	it("maps the request before handing it to the transport", async () => {
		const transport = new RecordingTransport();
		const model = new OpenAiModel("gpt-5", { temperature: 0.2 }, transport);

		await collect(model.generate(new ModelRequest([new UserMessage("hi")], [], PromptInstructions.from("be brief"))));

		expect(transport.request?.model).toBe("gpt-5");
		expect(transport.request?.messages).toEqual([
			{ role: "system", content: "be brief" },
			{ role: "user", content: "hi" },
		]);
		expect(transport.request?.parameters.temperature).toBe(0.2);
	});

	it("yields exactly the chunks the transport produced", async () => {
		const transport = new RecordingTransport([
			ModelChunk.text("Reem"),
			ModelChunk.text("bolso"),
			ModelChunk.finish("stop"),
		]);
		const model = new OpenAiModel("gpt-5", {}, transport);

		const chunks = await collect(model.generate(new ModelRequest([new UserMessage("hi")])));

		expect(chunks.map((chunk) => chunk.textDelta)).toEqual(["Reem", "bolso", ""]);
		expect(chunks.at(-1)?.isFinal).toBe(true);
	});

	it("forwards the abort signal to the transport", async () => {
		const transport = new RecordingTransport();
		const controller = new AbortController();

		await collect(new OpenAiModel("gpt-5", {}, transport).generate(new ModelRequest([]), controller.signal));

		expect(transport.signal).toBe(controller.signal);
	});

	it("declares no token counting, and offers no countTokens to call", () => {
		const model = new OpenAiModel("gpt-5", {}, new RecordingTransport());

		expect(model.descriptor().capabilities.supports(ModelCapability.TOKEN_COUNTING)).toBe(false);
		expect(model.countTokens).toBeUndefined();
	});

	it("is recognised as a spec across a package boundary", () => {
		expect(ModelSpec.is(new OpenAiModel("gpt-5", {}, new RecordingTransport()))).toBe(true);
		expect(ModelSpec.idOf(new OpenAiModel("gpt-5", {}, new RecordingTransport()))).toBe("gpt-5");
	});
});
