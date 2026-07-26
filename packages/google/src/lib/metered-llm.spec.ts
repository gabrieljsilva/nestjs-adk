import { BaseLlm, type BaseLlmConnection, type LlmRequest, type LlmResponse } from "@google/adk";
import type { TokenUsage } from "@nestjs-adk/core";
import { type MeteredCall, MeteredLlm } from "./metered-llm";

class StubLlm extends BaseLlm {
	public connected = false;

	public constructor(private readonly responses: LlmResponse[]) {
		super({ model: "gemini-2.5-flash" });
	}

	public async *generateContentAsync(): AsyncGenerator<LlmResponse, void> {
		for (const response of this.responses) yield response;
	}

	public connect(): Promise<BaseLlmConnection> {
		this.connected = true;
		return Promise.resolve("connected" as unknown as BaseLlmConnection);
	}
}

const toUsage = (usage: { promptTokenCount?: number; candidatesTokenCount?: number }): TokenUsage => ({
	promptTokens: usage.promptTokenCount ?? 0,
	outputTokens: usage.candidatesTokenCount ?? 0,
	totalTokens: (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0),
});

function request(): LlmRequest {
	return { contents: [], config: {}, liveConnectConfig: {}, toolsDict: {} };
}

async function drain(iterable: AsyncGenerator<LlmResponse, void>): Promise<LlmResponse[]> {
	const out: LlmResponse[] = [];
	for await (const item of iterable) out.push(item);
	return out;
}

describe("MeteredLlm — usage of calls the Runner never sees", () => {
	it("records the call under the inner model and passes every response through", async () => {
		const sink: MeteredCall[] = [];
		const inner = new StubLlm([
			{
				content: { role: "model", parts: [{ text: "summary" }] },
				usageMetadata: { promptTokenCount: 40_000, candidatesTokenCount: 500 },
			},
		]);

		const responses = await drain(new MeteredLlm(inner, sink, toUsage).generateContentAsync(request()));

		expect(responses).toHaveLength(1);
		expect(sink).toEqual([
			{ model: "gemini-2.5-flash", usage: { promptTokens: 40_000, outputTokens: 500, totalTokens: 40_500 } },
		]);
	});

	it("streaming counters are cumulative — only the last one is recorded, never the sum", async () => {
		const sink: MeteredCall[] = [];
		const inner = new StubLlm([
			{
				content: { role: "model", parts: [{ text: "a" }] },
				usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 1 },
			},
			{
				content: { role: "model", parts: [{ text: "b" }] },
				usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 7 },
			},
		]);

		await drain(new MeteredLlm(inner, sink, toUsage).generateContentAsync(request(), true));

		expect(sink).toEqual([
			{ model: "gemini-2.5-flash", usage: { promptTokens: 100, outputTokens: 7, totalTokens: 107 } },
		]);
	});

	it("a call the provider did not meter records nothing", async () => {
		const sink: MeteredCall[] = [];
		const inner = new StubLlm([{ content: { role: "model", parts: [{ text: "summary" }] } }]);

		await drain(new MeteredLlm(inner, sink, toUsage).generateContentAsync(request()));

		expect(sink).toEqual([]);
	});

	it("delegates live connections to the wrapped model", async () => {
		const inner = new StubLlm([]);

		await new MeteredLlm(inner, [], toUsage).connect(request());

		expect(inner.connected).toBe(true);
	});
});
