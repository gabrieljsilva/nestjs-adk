import "@nestjs-adk/testing/matchers";
import type { LlmRequest, LlmResponse } from "@google/adk";
import {
	AdkAgent,
	AdkModel,
	AdkModule,
	AdkTool,
	Agent,
	AgentRegistry,
	type GenerateOptions,
	type ModelRequest,
	type ModelResponse,
	ScriptedModel,
	Tool,
	fail,
} from "@nestjs-adk/core";
import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { AdkModelLlm } from "./adk-model-llm";
import { GoogleAdkEngine } from "./google-adk-engine";

class StubModel extends AdkModel {
	public readonly model = "stub-1";
	public requests: ModelRequest[] = [];
	public options: GenerateOptions[] = [];

	public constructor(private readonly chunks: ModelResponse[][]) {
		super();
	}

	public async *generate(request: ModelRequest, options?: GenerateOptions): AsyncIterable<ModelResponse> {
		this.requests.push(request);
		this.options.push(options ?? {});
		for (const chunk of this.chunks.shift() ?? []) yield chunk;
	}
}

function llmRequest(overrides: Partial<LlmRequest> = {}): LlmRequest {
	return { contents: [], liveConnectConfig: {}, toolsDict: {}, ...overrides };
}

async function drain(iterable: AsyncGenerator<LlmResponse, void>): Promise<LlmResponse[]> {
	const out: LlmResponse[] = [];
	for await (const item of iterable) out.push(item);
	return out;
}

describe("AdkModelLlm — LlmRequest → ModelRequest translation", () => {
	it("translates instruction, history (text/toolCall/toolResult), tool declarations and config", async () => {
		const model = new StubModel([[{ parts: [{ text: "ok" }] }]]);
		const llm = new AdkModelLlm(model);

		await drain(
			llm.generateContentAsync(
				llmRequest({
					contents: [
						{ role: "user", parts: [{ text: "hi" }] },
						{ role: "model", parts: [{ functionCall: { id: "c1", name: "get_weather", args: { city: "SP" } } }] },
						{ role: "user", parts: [{ functionResponse: { id: "c1", name: "get_weather", response: { tempC: 25 } } }] },
					],
					config: {
						systemInstruction: "be brief",
						temperature: 0.3,
						labels: { team: "ai" },
						tools: [
							{
								functionDeclarations: [{ name: "get_weather", description: "d", parametersJsonSchema: { type: "object" } }],
							},
						],
					},
				}),
			),
		);

		const request = model.requests[0];
		expect(request?.model).toBe("stub-1");
		expect(request?.systemInstruction).toBe("be brief");
		expect(request?.messages).toEqual([
			{ role: "user", parts: [{ text: "hi" }] },
			{ role: "assistant", parts: [{ toolCall: { id: "c1", name: "get_weather", args: { city: "SP" } } }] },
			{ role: "user", parts: [{ toolResult: { id: "c1", name: "get_weather", result: { tempC: 25 } } }] },
		]);
		expect(request?.tools).toEqual([{ name: "get_weather", description: "d", parameters: { type: "object" } }]);
		expect(request?.config?.temperature).toBe(0.3);
		expect(request?.config?.raw).toEqual({ labels: { team: "ai" } });
	});

	it("aggregates chunks: text deltas append, toolCalls accumulate, usage last-wins", async () => {
		const model = new StubModel([
			[
				{ parts: [{ text: "Hel" }] },
				{ parts: [{ text: "lo" }], usage: { promptTokens: 1, outputTokens: 1 } },
				{ parts: [{ toolCall: { name: "get_weather", args: { city: "SP" } } }] },
				{ usage: { promptTokens: 10, outputTokens: 5, totalTokens: 15 }, finishReason: "stop" },
			],
		]);
		const llm = new AdkModelLlm(model);

		const responses = await drain(llm.generateContentAsync(llmRequest()));

		expect(responses).toHaveLength(1);
		expect(responses[0]?.content?.parts).toEqual([
			{ text: "Hello" },
			{ functionCall: { id: "adk_model_call_1", name: "get_weather", args: { city: "SP" } } },
		]);
		expect(responses[0]?.usageMetadata).toMatchObject({
			promptTokenCount: 10,
			candidatesTokenCount: 5,
			totalTokenCount: 15,
		});
		expect(responses[0]?.finishReason).toBe("STOP");
	});

	it("stream mode: text deltas are forwarded as partials before the aggregated response", async () => {
		const model = new StubModel([[{ parts: [{ text: "a" }] }, { parts: [{ text: "b" }] }]]);
		const llm = new AdkModelLlm(model);

		const responses = await drain(llm.generateContentAsync(llmRequest(), true));

		expect(responses.map((r) => r.partial)).toEqual([true, true, undefined]);
		expect(responses[2]?.content?.parts?.[0]?.text).toBe("ab");
		expect(model.options[0]?.stream).toBe(true);
	});

	it("systemInstruction as Content, inlineData parts and parameters-only declarations are translated", async () => {
		const model = new StubModel([[{ parts: [{ text: "ok" }] }]]);
		const llm = new AdkModelLlm(model);

		await drain(
			llm.generateContentAsync(
				llmRequest({
					contents: [
						{ role: "user", parts: [{ inlineData: { mimeType: "image/png", data: "QUJD" } }] },
						{ role: "model", parts: [{ thought: true, text: "internal reasoning" }] },
					],
					config: {
						systemInstruction: { parts: [{ text: "a" }, { text: "b" }] },
						tools: [
							{ functionDeclarations: [{ name: "legacy", parameters: { type: "object", properties: {} } }] },
						] as unknown as NonNullable<LlmRequest["config"]>["tools"],
					},
				}),
			),
		);

		const request = model.requests[0];
		expect(request?.systemInstruction).toBe("a\nb");
		// the thought part (model-internal reasoning) is skipped entirely
		expect(request?.messages).toEqual([{ role: "user", parts: [{ data: { mimeType: "image/png", base64: "QUJD" } }] }]);
		expect(request?.tools).toEqual([
			{ name: "legacy", description: undefined, parameters: { type: "object", properties: {} } },
		]);
	});

	it("empty generation still yields one well-formed response (empty text)", async () => {
		const model = new StubModel([[]]);
		const llm = new AdkModelLlm(model);

		const responses = await drain(llm.generateContentAsync(llmRequest()));

		expect(responses).toHaveLength(1);
		expect(responses[0]?.content?.parts).toEqual([{ text: "" }]);
	});

	it("multiple toolCalls get sequential generated ids; totalTokens is computed when absent", async () => {
		const model = new StubModel([
			[
				{ parts: [{ toolCall: { name: "a", args: {} } }, { toolCall: { name: "b", args: {} } }] },
				{ usage: { promptTokens: 1, outputTokens: 2 } },
			],
		]);
		const llm = new AdkModelLlm(model);

		const responses = await drain(llm.generateContentAsync(llmRequest()));

		expect(responses[0]?.content?.parts).toEqual([
			{ functionCall: { id: "adk_model_call_1", name: "a", args: {} } },
			{ functionCall: { id: "adk_model_call_2", name: "b", args: {} } },
		]);
		expect(responses[0]?.usageMetadata).toMatchObject({ totalTokenCount: 3 });
	});

	it("duplicated tool call ids from the model are rewritten to stay unique (HITL handle)", async () => {
		const model = new StubModel([
			[{ parts: [{ toolCall: { id: "x", name: "a", args: {} } }, { toolCall: { id: "x", name: "b", args: {} } }] }],
		]);
		const llm = new AdkModelLlm(model);

		const responses = await drain(llm.generateContentAsync(llmRequest()));

		const ids = responses[0]?.content?.parts?.map((part) => part.functionCall?.id);
		expect(ids?.[0]).toBe("x");
		expect(ids?.[1]).toMatch(/^x_dup/);
		expect(new Set(ids).size).toBe(2);
	});

	it("aborted signal stops consumption — no final response is emitted", async () => {
		const model = new StubModel([[{ parts: [{ text: "ignored" }] }]]);
		const llm = new AdkModelLlm(model);
		const controller = new AbortController();
		controller.abort();

		const responses = await drain(llm.generateContentAsync(llmRequest(), false, controller.signal));

		expect(responses).toEqual([]);
	});

	it("connect() → clear error (live is not supported for custom models)", () => {
		const llm = new AdkModelLlm(new StubModel([]));
		expect(() => llm.connect()).toThrow(/live connections/);
	});
});

// --- full native loop: custom model driving tools/failover through the real ADK runner ---

const weatherSchema = z.object({ city: z.string() });

@Tool({ name: "get_weather", description: "Current weather for a city.", schema: weatherSchema })
class WeatherTool extends AdkTool<typeof weatherSchema> {
	execute(input: z.infer<typeof weatherSchema>) {
		return { tempC: 25, city: input.city };
	}
}

@Injectable()
class ToolCallingModel extends AdkModel {
	public readonly model = "custom-tool-caller";

	public async *generate(request: ModelRequest): AsyncIterable<ModelResponse> {
		const answered = request.messages.some((message) => message.parts.some((part) => "toolResult" in part));
		if (!answered && request.tools?.some((tool) => tool.name === "get_weather")) {
			yield {
				parts: [{ toolCall: { name: "get_weather", args: { city: "SP" } } }],
				usage: { promptTokens: 5, outputTokens: 2, totalTokens: 7 },
			};
			return;
		}
		yield { parts: [{ text: "SP está com 25C" }], usage: { promptTokens: 8, outputTokens: 4, totalTokens: 12 } };
	}
}

@Injectable()
class FallbackModel extends AdkModel {
	public readonly model = "custom-fallback";

	public async *generate(): AsyncIterable<ModelResponse> {
		yield { parts: [{ text: "custom fallback" }] };
	}
}

@Injectable()
class RecordingModel extends AdkModel {
	public readonly model = "recorder";
	public requests: ModelRequest[] = [];
	private turn = 0;

	public async *generate(request: ModelRequest): AsyncIterable<ModelResponse> {
		this.requests.push(request);
		yield { parts: [{ text: `r${++this.turn}` }] };
	}
}

const reportSchema = z.object({ city: z.string(), tempC: z.number() });

@Injectable()
class JsonModel extends AdkModel {
	public readonly model = "json-model";
	public requests: ModelRequest[] = [];

	public async *generate(request: ModelRequest): AsyncIterable<ModelResponse> {
		this.requests.push(request);
		yield { parts: [{ text: '{"city": "SP", "tempC": 25}' }] };
	}
}

@Agent({ name: "custom_weather_agent", description: "d", model: ToolCallingModel, tools: [WeatherTool] })
class CustomWeatherAgent extends AdkAgent {}

@Agent({ name: "session_agent", description: "d", model: RecordingModel })
class SessionAgent extends AdkAgent {}

@Agent({ name: "structured_custom_agent", description: "d", model: JsonModel, output: reportSchema })
class StructuredCustomAgent extends AdkAgent<typeof reportSchema> {}

@Module({
	providers: [
		CustomWeatherAgent,
		SessionAgent,
		StructuredCustomAgent,
		ToolCallingModel,
		FallbackModel,
		RecordingModel,
		JsonModel,
		WeatherTool,
	],
})
class CustomModelModule {}

describe("AdkModel — inside the real ADK loop", () => {
	let app: TestingModule;
	let registry: AgentRegistry;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: GoogleAdkEngine, defaultModel: "gemini-2.5-flash" }), CustomModelModule],
		}).compile();
		await app.init();
		registry = app.get(AgentRegistry);
	});

	afterEach(async () => {
		await app.close();
	});

	it("custom model calls a tool and finishes the loop with aggregated usage", async () => {
		const run = await registry.getRef(CustomWeatherAgent).ask({ message: "clima em SP?" });

		expect(run.text).toBe("SP está com 25C");
		expect(run.events.find((e) => e.type === "tool_call")).toMatchObject({
			tool: "get_weather",
			args: { city: "SP" },
		});
		expect(run.events.find((e) => e.type === "tool_result")).toMatchObject({
			tool: "get_weather",
			result: { tempC: 25, city: "SP" },
		});
		expect(run.usage.totalTokens).toBe(19);
	});

	it("session history is translated back into the custom model's messages on the next run", async () => {
		const model = app.get(RecordingModel);
		await registry.getRef(SessionAgent).ask({ message: "primeira", sessionId: "s1" });
		const run = await registry.getRef(SessionAgent).ask({ message: "segunda", sessionId: "s1" });

		expect(run.text).toBe("r2");
		const flat = model.requests[1]?.messages.map((message) => ({
			role: message.role,
			text: message.parts.map((part) => ("text" in part ? part.text : "")).join(""),
		}));
		expect(flat).toEqual([
			{ role: "user", text: "primeira" },
			{ role: "assistant", text: "r1" },
			{ role: "user", text: "segunda" },
		]);
	});

	it("structured output: responseSchema reaches the custom model via config.raw and the output is validated", async () => {
		const model = app.get(JsonModel);
		const run = await registry.getRef(StructuredCustomAgent).ask({ message: "weather?" });

		expect(run.output).toEqual({ city: "SP", tempC: 25 });
		expect(model.requests[0]?.config?.raw?.responseSchema).toBeDefined();
		expect(model.requests[0]?.config?.raw?.responseMimeType).toBe("application/json");
	});

});
