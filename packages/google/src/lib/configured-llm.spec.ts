import { BaseLlm, type BaseLlmConnection, type LlmRequest, type LlmResponse } from "@google/adk";
import { ConfiguredLlm } from "./configured-llm";

class RecordingLlm extends BaseLlm {
	public lastRequest?: LlmRequest;
	public lastStream?: boolean;

	public constructor() {
		super({ model: "recording" });
	}

	public async *generateContentAsync(llmRequest: LlmRequest, stream?: boolean): AsyncGenerator<LlmResponse, void> {
		this.lastRequest = llmRequest;
		this.lastStream = stream;
		yield { content: { role: "model", parts: [{ text: "inner ok" }] } };
	}

	public connect(): Promise<BaseLlmConnection> {
		return Promise.resolve("connected" as unknown as BaseLlmConnection);
	}
}

function request(config?: LlmRequest["config"]): LlmRequest {
	return { contents: [], config, liveConnectConfig: {}, toolsDict: {} };
}

async function drain(iterable: AsyncGenerator<LlmResponse, void>): Promise<LlmResponse[]> {
	const out: LlmResponse[] = [];
	for await (const item of iterable) out.push(item);
	return out;
}

describe("ConfiguredLlm — spec config at the model boundary", () => {
	it("fills an empty request config with the spec config (router/summarizer positions)", async () => {
		const inner = new RecordingLlm();
		const llm = new ConfiguredLlm(inner, { temperature: 0.1, labels: { team: "ai" } });

		const responses = await drain(llm.generateContentAsync(request()));

		expect(inner.lastRequest?.config).toMatchObject({ temperature: 0.1, labels: { team: "ai" } });
		expect(responses[0]?.content?.parts?.[0]?.text).toBe("inner ok");
	});

	it("request wins over the spec on conflicting keys (direct path stays a no-op)", async () => {
		const inner = new RecordingLlm();
		const llm = new ConfiguredLlm(inner, { temperature: 0.1, topP: 0.5 });

		await drain(llm.generateContentAsync(request({ temperature: 0.9 })));

		expect(inner.lastRequest?.config).toMatchObject({ temperature: 0.9, topP: 0.5 });
	});

	it("spec labels layer UNDER run labels (mergeLabelsCallback precedence preserved)", async () => {
		const inner = new RecordingLlm();
		const llm = new ConfiguredLlm(inner, { labels: { team: "ai", env: "spec" } });

		await drain(llm.generateContentAsync(request({ labels: { env: "run", run_tag: "t1" } })));

		expect(inner.lastRequest?.config?.labels).toEqual({ team: "ai", env: "run", run_tag: "t1" });
	});

	it("never mutates the incoming request (router failover retries with the original)", async () => {
		const inner = new RecordingLlm();
		const llm = new ConfiguredLlm(inner, { temperature: 0.1 });
		const original = request({ labels: { env: "run" } });

		await drain(llm.generateContentAsync(original));

		expect(original.config).toEqual({ labels: { env: "run" } });
		expect(inner.lastRequest).not.toBe(original);
		expect(inner.lastRequest?.config).toMatchObject({ temperature: 0.1 });
	});

	it("request keys explicitly set to undefined do NOT override the spec", async () => {
		const inner = new RecordingLlm();
		const llm = new ConfiguredLlm(inner, { temperature: 0.1 });

		await drain(llm.generateContentAsync(request({ temperature: undefined })));

		expect(inner.lastRequest?.config?.temperature).toBe(0.1);
	});

	it("delegates the stream flag and connect() to the inner model", async () => {
		const inner = new RecordingLlm();
		const llm = new ConfiguredLlm(inner, { temperature: 0.1 });

		await drain(llm.generateContentAsync(request(), true));
		expect(inner.lastStream).toBe(true);
		await expect(llm.connect(request())).resolves.toBe("connected");
	});
});
