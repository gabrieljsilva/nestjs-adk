import "@nestjs-adk/testing/matchers";
import { Gemini as NativeGemini } from "@google/adk";
import {
	AdkAgent,
	AdkEngine,
	Agent,
	AgentRegistry,
	AgentRunner,
	Gemini,
	OpenAiLike,
	ScriptedModel,
	contextPolicy,
	fail,
	text,
} from "@nestjs-adk/core";
import { AdkModule } from "@nestjs-adk/core";
import { Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { ConfiguredLlm } from "./configured-llm";
import { GoogleAdkEngine } from "./google-adk-engine";

@Agent({
	name: "gemini_agent",
	model: new Gemini("gemini-2.5-flash", {
		apiKey: "test-key",
		labels: { team: "growth" },
		cache: { content: "cachedContents/abc" },
		config: { temperature: 0.2 },
	}),
	description: "d",
})
class GeminiAgent extends AdkAgent {}

@Agent({
	name: "openai_agent",
	model: new OpenAiLike("gpt-4o-mini", { apiKeyEnv: "TEST_OPENAI_KEY" }),
	description: "d",
})
class OpenAiAgent extends AdkAgent {}

@Agent({
	name: "typed_gemini_agent",
	model: new Gemini("gemini-2.5-flash", {
		apiKey: "test-key",
		temperature: 0.1,
		topP: 0.5,
		stopSequences: ["FIM"],
		config: { temperature: 0.9, candidateCount: 2 },
	}),
	description: "d",
})
class TypedGeminiAgent extends AdkAgent {}

@Agent({
	name: "plain_gemini_agent",
	model: new Gemini("gemini-2.5-flash", { apiKey: "test-key" }),
	description: "d",
})
class PlainGeminiAgent extends AdkAgent {}

@Agent({
	name: "compaction_agent",
	model: new ScriptedModel(),
	description: "d",
	context: contextPolicy({
		compaction: { maxTokens: 500, summarizer: new Gemini("gemini-2.5-flash", { apiKey: "test-key", temperature: 0 }) },
	}),
})
class CompactionAgent extends AdkAgent {}

const labeledModel = new ScriptedModel();

@Agent({ name: "labeled_agent", model: labeledModel, description: "d" })
class LabeledAgent extends AdkAgent {}

const reportSchema = z.object({ city: z.string(), tempC: z.number() });
const outputModel = new ScriptedModel();

@Agent({ name: "structured_agent", model: outputModel, description: "d", output: reportSchema })
class StructuredAgent extends AdkAgent<typeof reportSchema> {}

@Module({
	providers: [
		GeminiAgent,
		OpenAiAgent,
		TypedGeminiAgent,
		PlainGeminiAgent,
		CompactionAgent,
		LabeledAgent,
		StructuredAgent,
	],
})
class FeatureModule {}

describe("GoogleAdkEngine — model specs (F6)", () => {
	let app: TestingModule;
	let registry: AgentRegistry;
	let engine: GoogleAdkEngine;

	beforeEach(async () => {
		process.env.TEST_OPENAI_KEY = "test-key";
		labeledModel.scripts.length = 0;
		outputModel.scripts.length = 0;
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: GoogleAdkEngine, defaultModel: "gemini-2.5-flash" }), FeatureModule],
		}).compile();
		await app.init();
		registry = app.get(AgentRegistry);
		engine = app.get(AdkEngine) as GoogleAdkEngine;
	});

	afterEach(async () => {
		await app.close();
	});

	it("new Gemini(): spec with config becomes a ConfiguredLlm over the native Gemini, config in generateContentConfig", async () => {
		const resolved = await app.get(AgentRunner).resolve(GeminiAgent);
		const llmAgent = await engine.toNative(resolved);

		expect(llmAgent.model).toBeInstanceOf(ConfiguredLlm);
		expect((llmAgent.model as unknown as { inner: unknown }).inner).toBeInstanceOf(NativeGemini);
		const config = (llmAgent as unknown as { generateContentConfig?: Record<string, unknown> }).generateContentConfig;
		expect(config).toMatchObject({
			labels: { team: "growth" },
			cachedContent: "cachedContents/abc",
			temperature: 0.2,
		});
	});

	it("new Gemini() without generation options stays a bare native Gemini (no wrapper)", async () => {
		const resolved = await app.get(AgentRunner).resolve(PlainGeminiAgent);
		const llmAgent = await engine.toNative(resolved);

		expect(llmAgent.model).toBeInstanceOf(NativeGemini);
	});

	it("typed generation fields win over the config escape hatch", async () => {
		const resolved = await app.get(AgentRunner).resolve(TypedGeminiAgent);
		const llmAgent = await engine.toNative(resolved);

		const config = (llmAgent as unknown as { generateContentConfig?: Record<string, unknown> }).generateContentConfig;
		expect(config).toMatchObject({
			temperature: 0.1,
			topP: 0.5,
			stopSequences: ["FIM"],
			candidateCount: 2,
		});
	});

	it("new OpenAiLike(): spec becomes an OpenAI-compatible model via the bridge", async () => {
		const resolved = await app.get(AgentRunner).resolve(OpenAiAgent);
		const llmAgent = await engine.toNative(resolved);
		expect((llmAgent.model as { constructor: { name: string } }).constructor.name).toBe("CustomLlm");
	});

	it("compaction summarizer keeps its own spec config (wrapped in ConfiguredLlm)", async () => {
		const resolved = await app.get(AgentRunner).resolve(CompactionAgent);
		const llmAgent = await engine.toNative(resolved);

		// LlmAgent wraps contextCompactors into a ContextCompactorRequestProcessor in requestProcessors.
		const processors = (llmAgent as unknown as { requestProcessors: Array<{ compactors?: unknown[] }> })
			.requestProcessors;
		const compactor = processors.find((processor) => processor.compactors)?.compactors?.[0];
		const summarizerLlm = (compactor as { summarizer: { llm: unknown } }).summarizer.llm;
		expect(summarizerLlm).toBeInstanceOf(ConfiguredLlm);
		expect((summarizerLlm as unknown as { specConfig: Record<string, unknown> }).specConfig).toMatchObject({
			temperature: 0,
		});
	});

	it("per-run labels (ask({ labels })) are merged into the request via beforeModelCallback", async () => {
		labeledModel.enqueue([text("ok")]);
		await registry.getRef(LabeledAgent).ask({ message: "hi", labels: { run_tag: "t1" } });

		expect(engine.lastRequest?.config?.labels).toMatchObject({ run_tag: "t1" });
	});

	it("structured output: outputSchema arrives as responseSchema in the request (no tools)", async () => {
		outputModel.enqueue([text('{"city": "SP", "tempC": 25}')]);
		const run = await registry.getRef(StructuredAgent).ask({ message: "weather?" });

		expect(run.output).toEqual({ city: "SP", tempC: 25 });
		expect(engine.lastRequest?.config?.responseSchema).toBeDefined();
		expect(engine.lastRequest?.config?.responseMimeType).toBe("application/json");
	});
});
